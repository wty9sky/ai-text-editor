import type { ImageLayer } from '../src/index.js'
import { describe, expect, it, vi } from 'vitest'
import { createImageAiPlugin, ImageEditor } from '../src/index.js'

function layer(id = 'a'): ImageLayer {
  return {
    id,
    type: 'solid',
    color: '#ff0000',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    blend: 'source-over',
  }
}
function context() {
  return {
    canvas: { width: 1024, height: 1024 },
    save: vi.fn(),
    restore: vi.fn(),
    resetTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}
describe('image SDK', () => {
  it('resizes the artboard without moving layers and restores crop and background through history', () => {
    const e = new ImageEditor()
    e.execute('layer.add', layer())
    e.execute('image.crop', { x: 10, y: 10, width: 200, height: 200 })
    e.execute('canvas.resize', { width: 80, height: 60 })
    expect(e.document.crop).toBeUndefined()
    expect(e.document.layers[0]).toEqual(layer())
    e.undo()
    expect(e.document.crop?.width).toBe(200)
    expect(() => e.execute('canvas.resize', { width: 0, height: 1 })).toThrow()
    e.execute('canvas.background', '#eeeeee')
    e.execute('canvas.background', null)
    expect(e.document.background).toBeUndefined()
    e.undo()
    expect(e.document.background).toBe('#eeeeee')
    e.destroy()
  })
  it('requires plugins, preserves original layer data after uninstall and supports history', () => {
    const bare = new ImageEditor({ plugins: [] })
    expect(() => bare.execute('layer.add', layer())).toThrow('Unknown command')
    const e = new ImageEditor()
    e.execute('layer.add', layer())
    e.execute('layer.update', {
      id: 'a',
      patch: { rotation: 45, opacity: 0.5 },
    })
    e.undo()
    expect(e.document.layers[0].rotation).toBe(0)
    e.redo()
    e.plugins.remove('image.layers')
    expect(e.document.layers[0].rotation).toBe(45)
  })
  it('validates layer identity, transforms and crop; reorders predictably', () => {
    const e = new ImageEditor()
    e.execute('layer.add', layer())
    expect(() => e.execute('layer.add', layer())).toThrow('layer')
    expect(() => e.execute('layer.update', {
      id: 'a',
      patch: { opacity: 2 },
    })).toThrow('layer')
    e.execute('layer.add', layer('b'))
    e.execute('layer.reorder', { id: 'b', index: 0 })
    expect(e.document.layers.map(l => l.id)).toEqual(['b', 'a'])
    expect(() => e.execute('image.crop', {
      x: 1000,
      y: 0,
      width: 100,
      height: 100,
    })).toThrow('crop')
    e.execute('image.crop', {
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    })
    e.undo()
    expect(e.document.crop).toBeUndefined()
  })
  it('renders ordered visible layers and restores drawing context', async () => {
    const e = new ImageEditor()
    e.execute('layer.add', layer())
    e.execute('layer.add', {
      ...layer('b'),
      visible: false,
    })
    const c = context()
    await e.execute<Promise<void>>('image.render', {
      context: c,
      resolveAsset: async () => {
        throw new Error('not used')
      },
    })
    expect(c.fillRect).toHaveBeenCalledOnce()
    expect(c.save).toHaveBeenCalledTimes(2)
    expect(c.restore).toHaveBeenCalledTimes(2)
  })
  it('rejects stale asynchronous asset loads before drawing', async () => {
    const e = new ImageEditor()
    e.execute('layer.add', {
      ...layer(),
      type: 'image',
      assetId: 'asset',
    })
    let finish!: (image: CanvasImageSource) => void
    const c = context()
    const pending = e.execute<Promise<void>>('image.render', {
      context: c,
      resolveAsset: () => new Promise((resolve) => {
        finish = resolve
      }),
    })
    e.execute('layer.update', {
      id: 'a',
      patch: { x: 10 },
    })
    finish({} as CanvasImageSource)
    await expect(pending).rejects.toThrow('changed')
    expect(c.clearRect).not.toHaveBeenCalled()
  })
  it('adds AI output as a new undoable layer and retains the original', async () => {
    const e = new ImageEditor()
    e.execute('layer.add', layer())
    e.plugins.use(createImageAiPlugin({
      generate: async () => ({ assetId: 'generated' }),
    }))
    await e.execute<Promise<unknown>>('image.ai', { instruction: 'sky' })
    expect(e.document.layers).toHaveLength(2)
    expect(e.document.layers[0]).toEqual(layer())
    expect(e.document.layers[1].assetId).toBe('generated')
    e.undo()
    expect(e.document.layers).toHaveLength(1)
  })
  it('cancels AI work when plugin is removed and cleans up idempotently', async () => {
    const e = new ImageEditor()
    let finish!: (v: {
      assetId: string
    }) => void
    let signal!: AbortSignal
    e.plugins.use(createImageAiPlugin({
      generate: async (request) => {
        signal = request.signal
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    }))
    const pending = e.execute<Promise<unknown>>('image.ai', { instruction: 'sky' })
    e.plugins.remove('image.ai')
    expect(signal.aborted).toBe(true)
    finish({ assetId: 'late' })
    await expect(pending).rejects.toBeDefined()
    expect(e.document.layers).toHaveLength(0)
    const doc = JSON.stringify(e.document)
    e.load(doc)
    expect(e.canUndo).toBe(false)
    e.destroy()
    e.destroy()
    expect(e.state).toBe('destroyed')
  })
})
it('preserves unknown layers and supports independently installed custom renderers', async () => {
  const e = new ImageEditor()
  e.execute('layer.add', {
    ...layer(),
    type: 'custom',
    props: { source: 'keep' },
  })
  const doc = JSON.stringify(e.document)
  e.load(doc)
  const draw = vi.fn()
  const c = context()
  await expect(e.execute<Promise<void>>('image.render', {
    context: c,
    resolveAsset: async () => ({}),
  })).rejects.toThrow('Unknown image layer renderer')
  e.plugins.use({
    name: 'custom',
    install(ctx) {
      ctx.register('image.layer', 'custom', { type: 'custom', draw })
    },
  })
  await e.execute<Promise<void>>('image.render', {
    context: c,
    resolveAsset: async () => ({}),
  })
  expect(draw).toHaveBeenCalledOnce()
  e.plugins.remove('custom')
  expect(e.document.layers[0].props).toEqual({ source: 'keep' })
})

it('keeps a duplicate next to its source and protects a locked layer through undo', () => {
  const editor = new ImageEditor()
  editor.execute('layer.add', layer('base'))
  editor.execute('layer.add', layer('top'))
  const copy = editor.execute<string>('layer.duplicate', 'base')
  expect(editor.document.layers.map(l => l.id)).toEqual(['base', copy, 'top'])
  editor.execute('layer.update', { id: copy, patch: { locked: true } })
  expect(() => editor.execute('layer.remove', copy)).toThrow('locked')
  expect(() => editor.execute('layer.update', { id: copy, patch: { x: 1 } })).toThrow('locked')
  editor.undo()
  editor.undo()
  expect(editor.document.layers.map(l => l.id)).toEqual(['base', 'top'])
  editor.destroy()
})
