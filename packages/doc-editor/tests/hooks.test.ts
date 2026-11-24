import type { DocEditorPlugin, Decision } from '../src/index.js'
import { describe, expect, it, vi } from 'vitest'
import { AiSession, DEFAULT_PLUGINS, Editor, SdkError } from '../src/index.js'

const block = (id = 'a', text = 'old') => ({ id, type: 'paragraph', text })
function make() {
  const editor = new Editor({ plugins: DEFAULT_PLUGINS })
  editor.setBlocks([
    block(),
  ])
  return editor
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
describe('named SDK hooks and publication', () => {
  it('observes initialization, scoped teardown, and final host destruction in order', () => {
    const order: string[] = []
    const editor = new Editor({
      setup(hooks) {
        hooks.on('sdk:destroyed', () => {
          order.push('destroyed')
        })
      },
      plugins: [
        {
          name: 'observe',
          install(ctx) {
            ctx.hooks.on('sdk:beforeReady', () => {
              order.push('before')
            })
            ctx.hooks.on('sdk:ready', () => {
              order.push('ready')
            })
            ctx.hooks.on('sdk:beforeDestroy', () => {
              order.push('destroying')
            })
            ctx.onDispose(() => {
              order.push('clean')
            })
          },
        },
      ],
    })
    expect(order).toEqual(['before', 'ready'])
    editor.destroy()
    editor.destroy()
    expect(order).toEqual([
      'before',
      'ready',
      'destroying',
      'clean',
      'destroyed',
    ])
    expect(() => editor.hooks.on('sdk:ready', () => {})).toThrow('disposed')
  })
  it('cleans initialization failures and rejects asynchronous synchronous hooks safely', () => {
    const cleanup = vi.fn()
    expect(() => new Editor({
      plugins: [
        {
          name: 'bad-ready',
          install(ctx) {
            ctx.onDispose(cleanup)
            ctx.hooks.on('sdk:beforeReady', (() => Promise.reject(new Error('async'))) as any)
          },
        },
      ],
    })).toThrow('Promise')
    expect(cleanup).toHaveBeenCalledOnce()
  })
  it('sorts dependency hooks before priorities and auto-cleans subscriptions', () => {
    const calls: string[] = []
    const editor = new Editor({
      plugins: [
        {
          name: 'dependent',
          requires: [
            { name: 'base', version: '^1.0.0' },
          ],
          install(ctx) {
            ctx.hooks.on('command:before', () => {
              calls.push('dependent')
              return {
                allow: true,
              }
            }, {
              priority: 999,
            })
          },
        },
        {
          name: 'base',
          version: '1.2.0',
          install(ctx) {
            ctx.registerCommand({
              id: 'noop',
              execute() {},
            })
            ctx.hooks.on('command:before', () => {
              calls.push('base-low')
              return {
                allow: true,
              }
            })
            ctx.hooks.on('command:before', () => {
              calls.push('base-high')
              return {
                allow: true,
              }
            }, {
              priority: 2,
            })
          },
        },
      ],
    })
    editor.execute('noop')
    expect(calls).toEqual(['base-high', 'base-low', 'dependent'])
    editor.plugins.remove('dependent')
    calls.length = 0
    editor.execute('noop')
    expect(calls).toEqual(['base-high', 'base-low'])
    editor.destroy()
  })
  it('preflights graphs and versions without running plugin code', () => {
    const install = vi.fn()
    for (const plugins of [
      [
        {
          name: 'a',
          requires: ['b'],
          install,
        },
        {
          name: 'b',
          requires: ['a'],
          install,
        },
      ],
      [
        {
          name: 'a',
          requires: [
            { name: 'b', version: '^2.0.0' },
          ],
          install,
        },
        { name: 'b', version: '1.0.0', install },
      ],
      [
        { name: 'a', apiVersion: '^9.0.0', install },
      ],
      [
        { name: 'a', install },
        { name: 'a', install },
      ],
    ] as DocEditorPlugin[][]) expect(() => new Editor({ plugins })).toThrow()
    expect(install).not.toHaveBeenCalled()
    const editor = new Editor({
      plugins: [
        { name: 'legacy', install },
        {
          name: 'optional',
          requires: [
            { name: 'missing', version: '^1.0.0', optional: true },
          ],
          install,
        },
      ],
    })
    expect(() => editor.plugins.use({
      name: 'versioned',
      requires: [
        { name: 'legacy', version: '*' },
      ],
      install,
    })).toThrow('Incompatible')
    editor.destroy()
  })
  it('rejects before install/remove, rolls back registration and forbids lifecycle reentry', () => {
    const editor = make()
    const cleanup = vi.fn()
    const deny = editor.hooks.on('plugin:beforeInstall', ({ plugin }) => plugin.name === 'denied'
      ? { allow: false, code: 'DENIED' }
      : { allow: true })
    expect(() => editor.plugins.use({ name: 'denied', install: cleanup })).toThrow('rejected')
    expect(cleanup).not.toHaveBeenCalled()
    deny()
    expect(() => editor.plugins.use({
      name: 'bad',
      install(ctx) {
        ctx.hooks.on('command:before', () => ({ allow: false, code: 'LEAK' }))
        ctx.events.subscribe('history:changed', cleanup)
        ctx.registerCommand({
          id: 'leak',
          execute() {},
        })
        throw new Error('failed')
      },
    })).toThrow('failed')
    expect(editor.plugins.getCommand('leak')).toBeUndefined()
    editor.execute('core.undo')
    expect(cleanup).not.toHaveBeenCalled()
    const remove = editor.hooks.on('plugin:beforeRemove', () => ({ allow: false, code: 'KEEP' }))
    expect(() => editor.plugins.remove('core.ops')).toThrow('rejected')
    remove()
    editor.hooks.on('command:before', () => {
      editor.plugins.remove('core.ops')
      return { allow: true }
    })
    expect(() => editor.execute('core.undo')).toThrow('Hook failed')
    expect(editor.plugins.has('core.ops')).toBe(true)
    editor.destroy()
  })
  it('validates decisions, short-circuits command execution, and isolates notifications', () => {
    const editor = make()
    const execute = vi.fn()
    editor.plugins.use({
      name: 'cmd',
      install(ctx) {
        ctx.registerCommand({
          id: 'test',
          validate(input) {
            if (input !== 1)
              throw new Error('input')
          },
          execute,
        })
      },
    })
    const before = vi.fn((): Decision => ({ allow: true }))
    const invalid = editor.hooks.on('command:before', (() => true) as any, { priority: 2 })
    editor.hooks.on('command:before', before)
    expect(() => editor.execute('test', 1)).toThrow('Decision')
    expect(before).not.toHaveBeenCalled()
    invalid()
    expect(() => editor.execute('test', 2)).toThrow('input')
    const subscriber = vi.fn()
    editor.hooks.on('command:after', () => {
      throw new Error('notification')
    })
    editor.events.subscribe('command:after', () => {
      throw new Error('subscriber')
    })
    editor.events.subscribe('command:after', subscriber)
    editor.execute('test', 1)
    expect(execute).toHaveBeenCalledOnce()
    expect(subscriber).toHaveBeenCalledOnce()
    expect(editor.diagnostics.some(record => record.phase.startsWith('subscriber:') && record.status === 'error')).toBe(true)
    editor.destroy()
  })
  it('guards direct edits, compound transactions and undo before modifying history', () => {
    const editor = make()
    editor.select(['a'])
    const document = editor.toDocument()
    const committed = vi.fn()
    const rolledBack = vi.fn()
    editor.events.subscribe('transaction:committed', committed)
    editor.events.subscribe('transaction:rolledBack', rolledBack)
    const reject = editor.hooks.on('transaction:beforeCommit', ({ after }) => after.blocks.some(b => b.text === 'forbidden')
      ? { allow: false, code: 'CONTENT' }
      : { allow: true })
    expect(() => editor.update('a', { text: 'forbidden' })).toThrow(SdkError)
    expect(editor.toDocument()).toEqual(document)
    expect(editor.canUndo).toBe(false)
    expect(() => editor.transaction(() => {
      editor.select([])
      editor.insert(1, block('b', 'allowed'))
      editor.update('a', { text: 'forbidden' })
    })).toThrow()
    expect(editor.toDocument()).toEqual(document)
    expect(editor.selection).toEqual(['a'])
    expect(editor.canUndo).toBe(false)
    expect(committed).not.toHaveBeenCalled()
    expect(rolledBack).toHaveBeenCalledTimes(2)
    reject()
    editor.update('a', { text: 'allowed' })
    const blockUndo = editor.hooks.on('transaction:beforeCommit', () => ({ allow: false, code: 'NO_UNDO' }))
    expect(() => editor.undo()).toThrow()
    expect(editor.blocks[0].text).toBe('allowed')
    expect(editor.canUndo).toBe(true)
    expect(editor.canRedo).toBe(false)
    blockUndo()
    editor.undo()
    expect(editor.blocks[0].text).toBe('old')
    editor.destroy()
  })
  it('preserves old session, history and signal when document load is rejected', () => {
    const editor = make()
    editor.update('a', { text: 'edited' })
    const signal = editor.signal
    const generation = editor.generation
    editor.hooks.on('document:beforeLoad', () => ({ allow: false, code: 'KEEP_DOCUMENT' }))
    expect(() => editor.setBlocks([
      block('new'),
    ])).toThrow()
    expect(editor.signal).toBe(signal)
    expect(signal.aborted).toBe(false)
    expect(editor.generation).toBe(generation)
    expect(editor.canUndo).toBe(true)
    editor.destroy()
  })
  it('uses read-only snapshots, forbids mutations during publication, and bounds private diagnostics', () => {
    const editor = make()
    editor.hooks.on('transaction:beforeCommit', ({ after }) => {
      expect(() => {
        after.blocks[0].text = 'tamper'
      }).toThrow()
      expect(() => editor.update('a', { text: 'reentrant' })).toThrow('dispatch')
      return { allow: true }
    })
    editor.events.subscribe('transaction:committed', () => {
      editor.update('a', {
        text: 'recursive',
      })
    })
    editor.update('a', { text: 'secret body' })
    expect(editor.blocks[0].text).toBe('secret body')
    expect(JSON.stringify(editor.diagnostics)).not.toContain('secret body')
    for (let i = 0; i < 510; i++) editor.hooks.record(editor.createMeta(), 'test', 'ok')
    expect(editor.diagnostics).toHaveLength(500)
    editor.destroy()
  })
})
describe('aI preparation and application', () => {
  function setup(run: (ctx: any) => Promise<any>) {
    const editor = make()
    editor.plugins.use({
      name: 'ai',
      install(ctx) {
        ctx.registerAiAction({
          id: 'polish',
          kind: 'polish',
          label: 'Polish',
          run,
        })
      },
    })
    return editor
  }
  it('enriches context by namespace, retains candidate on denial, and applies once in one transaction', async () => {
    const provider = vi.fn(async ctx => ({ text: `${ctx.block.text} improved` }))
    const editor = setup(provider)
    editor.plugins.use({
      name: 'context',
      install(ctx) { ctx.hooks.on('ai:prepareContext', async () => ({ language: 'zh' })) },
    })
    editor.hooks.on('ai:prepareContext', async () => {
      throw new Error('optional')
    }, {
      failure: 'optional',
    })
    const session = new AiSession(editor, 'polish', 'a')
    await session.run('polish')
    expect(provider.mock.calls[0][0].context.context).toEqual({ language: 'zh' })
    const deny = editor.hooks.on('ai:beforeApply', () => ({ allow: false, code: 'REVIEW' }))
    expect(() => session.apply()).toThrow('rejected')
    expect(editor.blocks[0].text).toBe('old')
    deny()
    session.apply()
    expect(editor.blocks[0].text).toBe('old improved')
    expect(() => session.apply()).toThrow()
    editor.undo()
    expect(editor.blocks[0].text).toBe('old')
    editor.destroy()
  })
  it('does not call provider when required preparation fails or policy denies AI', async () => {
    const run = vi.fn(async () => ({ text: 'new' }))
    const editor = setup(run)
    editor.hooks.on('ai:prepareContext', async () => {
      throw new Error('preparation')
    })
    await expect(new AiSession(editor, 'polish', 'a').run('test')).rejects.toThrow('preparation')
    expect(run).not.toHaveBeenCalled()
    editor.destroy()
    const denied = new Editor({
      authorize: request => request.capability !== 'ai.invoke',
      plugins: [
        {
          name: 'ai',
          install(ctx) {
            ctx.registerAiAction({
              id: 'x',
              label: 'x',
              kind: 'generate',
              run,
            })
          },
        },
      ],
    })
    expect(() => new AiSession(denied, 'x')).toThrow('denied')
    expect(run).not.toHaveBeenCalled()
    denied.destroy()
  })
  it('rejects late preparation after plugin removal, document replacement and user cancellation', async () => {
    for (const cancel of ['plugin', 'document', 'user']) {
      const pending = deferred<Record<string, unknown>>()
      const run = vi.fn(async () => ({ text: 'late' }))
      const editor = setup(run)
      editor.hooks.on('ai:prepareContext', () => pending.promise)
      const session = new AiSession(editor, 'polish', 'a')
      const task = session.run('test')
      if (cancel === 'plugin') {
        editor.plugins.remove('ai')
      }
      else if (cancel === 'document') {
        editor.setBlocks([
          block('new', 'replacement'),
        ])
      }
      else {
        session.dispose()
      }
      pending.resolve({})
      await expect(task).rejects.toThrow()
      expect(run).not.toHaveBeenCalled()
      expect(editor.blocks[0].text).not.toBe('late')
      editor.destroy()
    }
  })
  it('validates output and prevents ignored cancellation from applying', async () => {
    const pending = deferred<any>()
    const editor = setup(() => pending.promise)
    const session = new AiSession(editor, 'polish', 'a')
    const task = session.run('test')
    await Promise.resolve()
    session.dispose()
    pending.resolve({ text: 'late' })
    await expect(task).rejects.toThrow()
    expect(editor.blocks[0].text).toBe('old')
    editor.destroy()
    const invalid = setup(async () => ({ text: 42 }))
    await expect(new AiSession(invalid, 'polish', 'a').run('test')).rejects.toThrow('invalid output')
    invalid.destroy()
  })
})

it('uses hook snapshots and idempotent host disposers without losing later subscriptions', () => {
  const editor = make()
  const calls: string[] = []
  let offSecond = () => {}
  let registered = false
  editor.hooks.on('command:before', () => {
    calls.push('first')
    offSecond()
    if (!registered) {
      registered = true
      editor.hooks.on('command:before', () => {
        calls.push('late')
        return {
          allow: true,
        }
      })
    }
    return { allow: true }
  }, { priority: 2 })
  offSecond = editor.hooks.on('command:before', () => {
    calls.push('second')
    return {
      allow: true,
    }
  })
  editor.execute('core.undo')
  expect(calls).toEqual(['first'])
  editor.execute('core.undo')
  expect(calls).toEqual(['first', 'first', 'late'])
  const old = editor.hooks.on('ai:afterRun', () => {})
  old()
  const fresh = vi.fn()
  editor.hooks.on('ai:afterRun', fresh)
  old()
  editor.hooks.dispatch('ai:afterRun', {
    meta: editor.createMeta('ai'),
    actionId: 'x',
  })
  expect(fresh).toHaveBeenCalledOnce()
  editor.destroy()
})
it('finishes cleanup with failures and cannot veto overall destruction', () => {
  const finalized = vi.fn()
  const editor = new Editor({
    setup(hooks) {
      hooks.on('plugin:beforeRemove', () => ({ allow: false, code: 'KEEP' }))
      hooks.on('sdk:destroyed', finalized)
    },
    plugins: [
      {
        name: 'bad-cleanup',
        install() {
          return () => {
            throw new Error('cleanup')
          }
        },
      },
    ],
  })
  expect(() => editor.destroy()).toThrow(AggregateError)
  expect(editor.state).toBe('destroyed')
  expect(finalized).toHaveBeenCalledOnce()
  expect(editor.diagnostics.some(record => record.code === 'CLEANUP_FAILED')).toBe(true)
})
it('shares operation identity across command, transaction and history notices', () => {
  const editor = make()
  const ids: string[] = []
  editor.events.subscribe('transaction:committed', ({
    meta,
  }) => {
    ids.push(meta.operationId)
  })
  editor.events.subscribe('history:changed', ({
    meta,
  }) => {
    ids.push(meta.operationId)
  })
  editor.events.subscribe('command:after', ({
    meta,
  }) => {
    ids.push(meta.operationId)
  })
  editor.plugins.use({
    name: 'write',
    install(ctx) {
      ctx.registerCommand({
        id: 'write',
        execute(editor) { editor.update('a', { text: 'write' }) },
      })
    },
  })
  editor.execute('write')
  expect(ids).toHaveLength(3)
  expect(new Set(ids).size).toBe(1)
  editor.destroy()
})
it('cancels a hung provider promptly and honors timeout without late writeback', async () => {
  const never = new Promise<any>(() => {})
  const editor = make()
  editor.plugins.use({
    name: 'hung',
    install(ctx) {
      ctx.registerAiAction({
        id: 'hung',
        kind: 'polish',
        label: 'hung',
        run: () => never,
      })
    },
  })
  const session = new AiSession(editor, 'hung', 'a')
  const task = session.run('test')
  session.dispose()
  await expect(task).rejects.toThrow()
  const timed = new AiSession(editor, 'hung', 'a', { timeoutMs: 1 })
  await expect(timed.run('test')).rejects.toThrow()
  expect(editor.blocks[0].text).toBe('old')
  editor.destroy()
})
it('keeps event buses isolated between editors and rejects policy reentry', () => {
  const a = make()
  const b = make()
  const listener = vi.fn()
  a.events.subscribe('transaction:committed', listener)
  b.update('a', { text: 'isolated' })
  expect(listener).not.toHaveBeenCalled()
  a.destroy()
  b.destroy()
  const editor = new Editor({
    authorize() {
      editor.update(editor.blocks[0].id, {
        text: 'reentrant',
      })
      return true
    },
  })
  expect(() => editor.update(editor.blocks[0].id, { text: 'write' })).toThrow('policy failed')
  expect(editor.blocks[0].text).toBe('')
  editor.destroy()
})

it('keeps installation order when an earlier plugin registers another same-priority hook later', () => {
  const calls: string[] = []
  let registerLater = () => {}
  const editor = new Editor({
    plugins: [
      {
        name: 'first',
        install(ctx) {
          registerLater = () => {
            ctx.hooks.on('command:before', () => {
              calls.push('first-late')
              return { allow: true }
            })
          }
          ctx.registerCommand({
            id: 'noop',
            execute() {},
          })
        },
      },
      {
        name: 'second',
        install(ctx) {
          ctx.hooks.on('command:before', () => {
            calls.push('second')
            return { allow: true }
          })
        },
      },
    ],
  })
  registerLater()
  editor.execute('noop')
  expect(calls).toEqual(['first-late', 'second'])
  editor.destroy()
})
