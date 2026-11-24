import { describe, expect, it, vi } from 'vitest'
import { AiSession, captureTarget, createAiActions, DEFAULT_PLUGINS, Editor, uploadFile } from '../src/index.js'

const block = (id = 'a', text = 'old') => ({ id, type: 'paragraph', text })
function editor() {
  const e = new Editor({ plugins: DEFAULT_PLUGINS })
  e.setBlocks([
    block(),
  ])
  return e
}
function defer<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
describe('document lifecycle and history', () => {
  it('isolates history on load and invalidates the old document signal', () => {
    const e = editor()
    const signal = e.signal
    e.update('a', { text: 'edited' })
    e.setBlocks([
      block('b', 'new'),
    ])
    e.undo()
    expect(e.blocks).toEqual([
      block('b', 'new'),
    ])
    expect(e.canUndo).toBe(false)
    expect(signal.aborted).toBe(true)
  })
  it('resets text coalescing after undo and redo', () => {
    const e = editor()
    e.update('a', { text: 'one' })
    e.update('a', { text: 'two' })
    e.undo()
    expect(e.getBlock('a')?.text).toBe('old')
    e.update('a', { text: 'new' })
    expect(e.canRedo).toBe(false)
    e.undo()
    expect(e.getBlock('a')?.text).toBe('old')
  })
  it('groups composite edits and restores selection', () => {
    const e = editor()
    const changes = vi.fn()
    e.on((event) => {
      if (event === 'change')
        changes()
    })
    e.transaction(() => {
      e.insert(0, block('b'))
      e.remove(['a'])
    })
    expect(changes).toHaveBeenCalledOnce()
    e.undo()
    expect(e.blocks).toEqual([
      block(),
    ])
    e.redo()
    expect(e.blocks).toEqual([
      block('b'),
    ])
  })
  it('rolls back nested savepoints and emits nothing for a failed outer transaction', () => {
    const e = editor()
    const changes = vi.fn()
    e.on(changes)
    expect(() => e.transaction(() => {
      e.update('a', { text: 'bad' })
      throw new Error('rollback')
    })).toThrow('rollback')
    expect(e.blocks).toEqual([
      block(),
    ])
    expect(e.canUndo).toBe(false)
    expect(changes).not.toHaveBeenCalled()
    e.transaction(() => {
      e.update('a', { text: 'outer' })
      try {
        e.transaction(() => {
          e.update('a', { text: 'inner' })
          throw new Error('x')
        })
      }
      catch {
      }
    })
    expect(e.getBlock('a')?.text).toBe('outer')
    e.undo()
    expect(e.getBlock('a')?.text).toBe('old')
  })
  it('validates edits before committing; snapshots cannot be mutated externally', () => {
    const e = editor()
    const props = {
      nested: { a: 1 },
    }
    e.update('a', { props })
    props.nested.a = 2
    expect(e.getBlock('a')?.props?.nested.a).toBe(1)
    expect(() => {
      e.getBlock('a')!.props!.nested.a = 9
    }).toThrow()
    expect(() => e.insert(1, block())).toThrow('Duplicate')
    expect(e.blocks).toHaveLength(1)
    expect(() => e.update('a', { id: 'b' })).toThrow('id cannot')
  })
  it('preserves unknown block data and document metadata through JSON', () => {
    const e = editor()
    const doc = {
      format: 'site.block-document',
      version: 1,
      id: 'doc',
      metadata: {
        nested: [1],
      },
      future: { value: 2 },
      blocks: [
        {
          ...block(),
          type: 'plugin.unknown',
          props: {
            layers: [1, 2],
          },
        },
      ],
    }
    e.loadDocument(JSON.stringify(doc))
    expect(JSON.parse(JSON.stringify(e.toDocument()))).toEqual(doc)
    expect(() => e.loadDocument({ ...doc, version: 2 })).toThrow('version')
    expect(e.toDocument()).toEqual(doc)
  })
  it('initializes state before plugins and destroys idempotently even on cleanup failure', () => {
    let ready = false
    const e = new Editor({
      plugins: [
        {
          name: 'x',
          install(ctx) {
            ready = ctx.editor.blocks.length === 1
            return () => {
              throw new Error('cleanup')
            }
          },
        },
      ],
    })
    expect(ready).toBe(true)
    expect(e.state).toBe('ready')
    expect(() => e.destroy()).toThrow()
    expect(e.state).toBe('destroyed')
    expect(() => e.destroy()).not.toThrow()
    expect(() => e.update('a', { text: 'x' })).toThrow('destroyed')
  })
  it('isolates observer failures from committed state and other observers', () => {
    const e = editor()
    const listener = vi.fn()
    e.on(() => {
      throw new Error('observer')
    })
    e.on(listener)
    e.update('a', { text: 'new' })
    expect(e.getBlock('a')?.text).toBe('new')
    expect(listener).toHaveBeenCalled()
    expect(e.errors.length).toBeGreaterThan(0)
  })
  it('moves only selected blocks when selection has gaps', () => {
    const e = editor()
    e.setBlocks(['a', 'b', 'c', 'd'].map(id => block(id)))
    e.move(['a', 'c'], 1)
    expect(e.blocks.map(b => b.id)).toEqual(['b', 'a', 'd', 'c'])
  })
})
describe('shared async operations', () => {
  it('uploads to stable block id even after reordering', async () => {
    const e = editor()
    const d = defer<{
      url: string
      name: string
    }>()
    e.insert(1, block('b'))
    e.plugins.use({
      name: 'upload',
      install(ctx) {
        ctx.registerUploader({
          id: 'u',
          label: 'u',
          kind: 'image',
          upload: () => d.promise,
        })
      },
    })
    const run = uploadFile(e, new File(['x'], 'x.png', { type: 'image/png' }), {
      target: captureTarget(e, 'a'),
    })
    e.move(['a'], 1)
    d.resolve({ url: '/image', name: 'x.png' })
    await run
    expect(e.getBlock('a')?.text).toBe('/image')
    expect(e.getBlock('b')?.text).toBe('old')
  })
  it('rejects upload completion after loading a document with the same block id', async () => {
    const e = editor()
    const d = defer<{
      url: string
    }>()
    e.plugins.use({
      name: 'u',
      install(ctx) {
        ctx.registerUploader({
          id: 'u',
          label: 'u',
          kind: 'image',
          upload: () => d.promise,
        })
      },
    })
    const pending = uploadFile(e, new File(['x'], 'x.png', { type: 'image/png' }), {
      target: captureTarget(e, 'a'),
    })
    e.setBlocks([
      block(),
    ])
    d.resolve({ url: '/late' })
    await expect(pending).rejects.toBeDefined()
    expect(e.getBlock('a')?.text).toBe('old')
  })
  it('rejects AI results for changed targets; plugin removal aborts provider signal', async () => {
    const e = editor()
    const d = defer<{
      text: string
    }>()
    let signal: AbortSignal | undefined
    e.plugins.use({
      name: 'ai',
      install(ctx) {
        ctx.registerAiAction({
          id: 'p',
          label: 'p',
          kind: 'polish',
          run(c) {
            signal = c.signal
            return d.promise
          },
        })
      },
    })
    const session = new AiSession(e, 'p', 'a')
    const pending = session.run('go')
    e.plugins.remove('ai')
    expect(signal?.aborted).toBe(true)
    d.resolve({ text: 'late' })
    await expect(pending).rejects.toBeDefined()
    expect(e.getBlock('a')?.text).toBe('old')
  })
  it('applies generated content as one undo step without an extra empty paragraph', async () => {
    const e = editor()
    e.setBlocks([
      block('a', ''),
    ])
    e.plugins.use({
      name: 'ai',
      install(ctx) {
        for (const a of createAiActions({
          generate: async () => `# Heading

Body`,
        }))
          ctx.registerAiAction(a)
      },
    })
    const session = new AiSession(e, 'ai.generate', 'a')
    await session.run('go')
    session.apply()
    expect(e.blocks.map(b => b.type)).toEqual(['h1', 'paragraph'])
    e.undo()
    expect(e.blocks).toEqual([
      block('a', ''),
    ])
    expect(e.canUndo).toBe(false)
  })
  it('rejects AI apply after target edit or explicit cancellation', async () => {
    const e = editor()
    e.plugins.use({
      name: 'ai',
      install(ctx) {
        for (const a of createAiActions({
          polish: async () => 'result',
        }))
          ctx.registerAiAction(a)
      },
    })
    const session = new AiSession(e, 'ai.polish', 'a')
    await session.run('go')
    e.update('a', { text: 'manual' })
    expect(() => session.apply()).toThrow('Target')
    session.dispose()
    expect(() => session.apply()).toThrow()
  })
})
it('splits the selected text in one undo step, including an empty paragraph', () => {
  const e = editor()
  e.update('a', { text: 'abcd' })
  e.execute('core.split', { id: 'a', from: 1, to: 3 })
  expect(e.blocks.map(b => b.text)).toEqual(['a', 'd'])
  e.undo()
  expect(e.blocks.map(b => b.text)).toEqual(['abcd'])
  e.setBlocks([
    block('a', ''),
  ])
  e.execute('core.split', { id: 'a', from: 0, to: 0 })
  expect(e.blocks).toHaveLength(2)
  e.undo()
  expect(e.blocks).toHaveLength(1)
})
it('shares unchanged immutable blocks across history snapshots', () => {
  const e = editor()
  e.insert(1, block('b'))
  const previous = e.getBlock('b')
  e.update('a', { text: 'new' })
  expect(e.getBlock('b')).toBe(previous)
  e.undo()
  expect(e.getBlock('b')).toBe(previous)
})
it('cleans up earlier plugins when a later plugin attempts destruction during initialization', () => {
  const cleanup = vi.fn()
  expect(() => new Editor({
    plugins: [
      {
        name: 'a',
        install() {
          return cleanup
        },
      },
      {
        name: 'b',
        install(ctx) {
          ctx.editor.destroy()
        },
      },
    ],
  })).toThrow('lifecycle hook')
  expect(cleanup).toHaveBeenCalledOnce()
})
