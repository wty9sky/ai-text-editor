import type { ExtensionApi, PluginContext } from '../src/index.js'
import { afterEach, expect, it, vi } from 'vitest'
import { AiSession, DEFAULT_PLUGINS, defineExtension, definePlugin, defineTopic, Editor } from '../src/index.js'

afterEach(() => vi.useRealTimers())

it('adapts apply/dispose to a frozen facade and scopes commands and resources', () => {
  let sdk!: ExtensionApi
  const dispose = vi.fn()
  const editor = new Editor({
    plugins: [
      defineExtension({
        name: 'extension',
        version: '1.0.0',
        apply(api) {
          sdk = api
          expect(Object.isFrozen(api)).toBe(true)
          expect('editor' in api).toBe(false)
          expect('plugins' in api).toBe(false)
          api.commands.register({
            id: 'extension.write',
            execute(api) {
              api.document.update(api.document.snapshot().blocks[0].id, { text: 'written' })
            },
          })
        },
        dispose,
      }),
    ],
  })
  editor.execute('extension.write')
  expect(editor.blocks[0].text).toBe('written')
  expect(() => {
    sdk.document.snapshot().blocks[0].text = 'tampered'
  }).toThrow()
  editor.plugins.remove('extension')
  expect(dispose).toHaveBeenCalledOnce()
  expect(editor.plugins.getCommand('extension.write')).toBeUndefined()
  expect(() => sdk.document.snapshot()).toThrow('disposed')
  expect(() => sdk.document.update('x', { text: 'late' })).toThrow('disposed')
  editor.destroy()
})
it('runs dispose after partial apply failure and refuses async cleanup safely', async () => {
  const dispose = vi.fn()
  const editor = new Editor()
  expect(() => editor.plugins.use(defineExtension({
    name: 'bad',
    version: '1.0.0',
    apply(api) {
      api.commands.register({
        id: 'leak',
        execute() {},
      })
      throw new Error('apply failed')
    },
    dispose,
  }))).toThrow('apply failed')
  expect(dispose).toHaveBeenCalledOnce()
  expect(editor.plugins.getCommand('leak')).toBeUndefined()
  editor.plugins.use(defineExtension({
    name: 'async-cleanup',
    version: '1.0.0',
    apply() {},
    dispose: async () => { throw new Error('late cleanup') },
  }))
  expect(() => editor.plugins.remove('async-cleanup')).toThrow(AggregateError)
  await Promise.resolve()
  expect(editor.state).toBe('ready')
  expect(editor.plugins.has('async-cleanup')).toBe(false)
  editor.destroy()
})
it('publishes validated frozen messages across plugins, isolates errors and cleans up subscribers', async () => {
  const topic = defineTopic<{ count: number }>('publisher:count', (value) => {
    if (!value || typeof (value as { count: unknown }).count !== 'number')
      throw new TypeError('count')
  })
  let publisher!: PluginContext
  let subscriber!: PluginContext
  const received = vi.fn()
  const editor = new Editor({
    plugins: [
      definePlugin({
        name: 'publisher',
        install(ctx) { publisher = ctx },
      }),
      definePlugin({
        name: 'subscriber',
        install(ctx) {
          subscriber = ctx
          ctx.messages.subscribe(topic, async () => {
            throw new Error('subscriber failure')
          })
          ctx.messages.subscribe(topic, (message) => {
            expect(Object.isFrozen(message.data)).toBe(true)
            expect(message.source).toBe('publisher')
            received(message.data.count)
          })
        },
      }),
    ],
  })
  const payload = { count: 1 }
  publisher.messages.publish(topic, payload)
  payload.count = 2
  await Promise.resolve()
  await Promise.resolve()
  expect(received).toHaveBeenCalledWith(1)
  expect(editor.diagnostics.some(record => record.pluginId === 'subscriber' && record.phase === 'message:subscriber')).toBe(true)
  expect(() => subscriber.messages.publish(topic, { count: 2 })).toThrow('namespace')
  expect(() => publisher.messages.publish(topic, { count: 'bad' } as any)).toThrow('count')
  editor.plugins.remove('subscriber')
  publisher.messages.publish(topic, { count: 3 })
  expect(received).toHaveBeenCalledTimes(1)
  expect(() => subscriber.messages.subscribe(topic, () => {})).toThrow('disposed')
  editor.destroy()
  expect(() => publisher.messages.publish(topic, { count: 4 })).toThrow('disposed')
})
it('keeps custom messages separate from core events and other editors and blocks inline document mutation', () => {
  const topic = defineTopic<number>('host:count')
  const a = new Editor()
  const b = new Editor()
  const listener = vi.fn()
  a.messages.subscribe(topic, listener)
  b.messages.publish(topic, 1)
  expect(listener).not.toHaveBeenCalled()
  a.messages.subscribe(topic, () => {
    a.update(a.blocks[0].id, {
      text: 'reentrant',
    })
  })
  a.messages.publish(topic, 2)
  expect(a.blocks[0].text).toBe('')
  expect(listener).toHaveBeenCalledOnce()
  a.destroy()
  b.destroy()
})
it('clears intervals, timeouts and DOM listeners on removal and rolls back partial installation', () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  const timer = vi.fn()
  const listener = vi.fn()
  const editor = new Editor({
    plugins: [
      {
        name: 'resources',
        install(ctx) {
          ctx.resources.timeout(timer, 20)
          ctx.resources.interval(timer, 10)
          ctx.resources.listen(target, 'tick', listener)
        },
      },
    ],
  })
  target.dispatchEvent(new Event('tick'))
  expect(listener).toHaveBeenCalledOnce()
  editor.plugins.remove('resources')
  vi.advanceTimersByTime(100)
  target.dispatchEvent(new Event('tick'))
  expect(timer).not.toHaveBeenCalled()
  expect(listener).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  expect(() => editor.plugins.use({
    name: 'failed',
    install(ctx) {
      ctx.resources.interval(timer, 5)
      ctx.resources.listen(target, 'tick', listener)
      throw new Error('failed')
    },
  })).toThrow('failed')
  expect(vi.getTimerCount()).toBe(0)
  target.dispatchEvent(new Event('tick'))
  expect(listener).toHaveBeenCalledOnce()
  editor.destroy()
})
it('isolates timer and DOM callback failures and releases completed timeout resources', async () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  const editor = new Editor({
    plugins: [
      {
        name: 'resource-errors',
        install(ctx) {
          ctx.resources.timeout(() => {
            throw new Error('timer')
          }, 1)
          ctx.resources.listen(target, 'tick', () => {
            throw new Error('DOM listener')
          })
          ctx.resources.interval(async () => {
            throw new Error('async timer')
          }, 2)
        },
      },
    ],
  })
  await vi.advanceTimersByTimeAsync(3)
  expect(() => target.dispatchEvent(new Event('tick'))).not.toThrow()
  expect(editor.diagnostics.filter(record => record.phase === 'resource:callback')).toHaveLength(3)
  editor.destroy()
  expect(vi.getTimerCount()).toBe(0)
})
it('supports optional per-hook timeouts and fails required hooks before calling provider', async () => {
  const run = vi.fn(async () => ({ text: 'result' }))
  const editor = new Editor({
    plugins: [
      ...DEFAULT_PLUGINS,
      {
        name: 'ai',
        install(ctx) {
          ctx.registerAiAction({
            id: 'test',
            label: 'test',
            kind: 'polish',
            run,
          })
        },
      },
    ],
  })
  const optional = editor.hooks.on('ai:prepareContext', () => new Promise(() => {}), { timeoutMs: 1, failure: 'optional' })
  await new AiSession(editor, 'test', editor.blocks[0].id).run('test')
  expect(run).toHaveBeenCalledOnce()
  optional()
  editor.hooks.on('ai:prepareContext', () => new Promise(() => {}), { timeoutMs: 1 })
  await expect(new AiSession(editor, 'test', editor.blocks[0].id).run('test')).rejects.toThrow()
  expect(run).toHaveBeenCalledOnce()
  expect(() => editor.hooks.on('command:before', () => ({ allow: true }), { timeoutMs: 1 })).toThrow('Timeouts')
  editor.destroy()
})
it('applies host permissions to facade document reads, writes and command calls', () => {
  let sdk!: ExtensionApi
  const editor = new Editor({
    authorize: request => request.pluginId !== 'restricted',
    plugins: [
      defineExtension({
        name: 'restricted',
        version: '1.0.0',
        apply(api) { sdk = api },
      }),
    ],
  })
  expect(() => sdk.document.snapshot()).toThrow('denied')
  expect(() => sdk.document.update(editor.blocks[0].id, { text: 'bad' })).toThrow('denied')
  expect(() => sdk.commands.execute('anything')).toThrow('denied')
  expect(editor.blocks[0].text).toBe('')
  editor.destroy()
})
