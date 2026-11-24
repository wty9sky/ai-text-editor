import type { StatePlugin } from '@sword-editor/runtime'
import { immutableJson, StateEditor } from '@sword-editor/runtime'

export interface ImageLayer {
  id: string
  type: string
  props?: Record<string, unknown>
  name?: string
  locked?: boolean
  bold?: boolean
  underline?: boolean
  fontFamily?: string
  direction?: 'horizontal' | 'vertical'
  stroke?: string
  assetId?: string
  color?: string
  text?: string
  fontSize?: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  blend: 'source-over' | 'multiply' | 'screen'
}
export interface ImageDocument {
  format: 'site.image-document'
  version: 1
  id: string
  width: number
  height: number
  background?: string
  layers: ImageLayer[]
  crop?: {
    x: number
    y: number
    width: number
    height: number
  }
}
export type ImagePlugin = StatePlugin<ImageDocument>
export type AssetResolver = (assetId: string, signal: AbortSignal) => Promise<CanvasImageSource>
export interface RenderRequest {
  previewPosition?: { id: string, x: number, y: number }
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  resolveAsset: AssetResolver
  signal?: AbortSignal
}
export interface ExportRequest {
  resolveAsset: AssetResolver
  signal?: AbortSignal
  type?: 'image/png' | 'image/jpeg' | 'image/webp'
  quality?: number
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const dimension = (n: unknown): n is number => finite(n) && n > 0 && n <= 32768
export function parseImageDocument(input: unknown): ImageDocument {
  const d = typeof input === 'string'
    ? JSON.parse(input)
    : input
  if (!d || d.format !== 'site.image-document' || d.version !== 1 || typeof d.id !== 'string' || !d.id || !dimension(d.width) || !dimension(d.height) || !Array.isArray(d.layers))
    throw new Error('Invalid image document')
  if (d.background !== undefined && (typeof d.background !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.background)))
    throw new Error('Invalid artboard background')
  const ids = new Set<string>()
  for (const layer of d.layers) {
    if (!layer || typeof layer.id !== 'string' || !layer.id || ids.has(layer.id) || (typeof layer.type !== 'string' || !layer.type) || ![
      layer.x,
      layer.y,
      layer.rotation,
      layer.opacity,
    ].every(finite) || !dimension(layer.width) || !dimension(layer.height) || layer.opacity < 0 || layer.opacity > 1 || typeof layer.visible !== 'boolean' || !['source-over', 'multiply', 'screen'].includes(layer.blend)) {
      throw new Error('Invalid image layer')
    }
    if (layer.type === 'image' && (typeof layer.assetId !== 'string' || !layer.assetId))
      throw new Error('Image layer requires assetId')
    if (layer.type === 'text' && (typeof layer.text !== 'string' || !dimension(layer.fontSize)))
      throw new Error('Invalid text layer')
    if ((layer.type === 'solid' || layer.type === 'text') && (typeof layer.color !== 'string' || !layer.color))
      throw new Error('Layer requires color')
    ids.add(layer.id)
  }
  if (d.crop && (!finite(d.crop.x) || !finite(d.crop.y) || !dimension(d.crop.width) || !dimension(d.crop.height) || d.crop.x < 0 || d.crop.y < 0 || d.crop.x + d.crop.width > d.width || d.crop.y + d.crop.height > d.height))
    throw new Error('Invalid crop rectangle')
  return immutableJson(d)
}
export const imageLayersPlugin: ImagePlugin = {
  name: 'image.layers',
  install(ctx) {
    ctx.registerCommand('layer.add', payload => ctx.editor.update(d => ({
      ...d,
      layers: [...d.layers, payload as ImageLayer],
    })))
    ctx.registerCommand('layer.update', (payload) => {
      const p = payload as {
        id: string
        patch: Partial<Omit<ImageLayer, 'id'>>
      }
      const layer = ctx.editor.document.layers.find(l => l.id === p.id)
      if (layer?.locked && !(p.patch.locked === false && Object.keys(p.patch).length === 1))
        throw new Error('Layer is locked')
      ctx.editor.update(d => ({
        ...d,
        layers: d.layers.map(l => l.id === p.id
          ? {
              ...l,
              ...p.patch,
              id: l.id,
            }
          : l),
      }))
    })
    ctx.registerCommand('layer.duplicate', (sourceId) => {
      const source = ctx.editor.document.layers.find(layer => layer.id === sourceId)
      if (!source)
        throw new Error('Unknown layer')
      const id = crypto.randomUUID()
      ctx.editor.update((doc) => {
        const layers = [...doc.layers]
        layers.splice(layers.indexOf(source) + 1, 0, {
          ...source,
          id,
          name: `${source.name || source.type} 副本`,
          x: source.x + 10,
          y: source.y + 10,
        })
        return { ...doc, layers }
      })
      return id
    })
    ctx.registerCommand('layer.remove', (id) => {
      if (ctx.editor.document.layers.find(l => l.id === id)?.locked)
        throw new Error('Layer is locked')
      ctx.editor.update(d => ({
        ...d,
        layers: d.layers.filter(l => l.id !== id),
      }))
    })
    ctx.registerCommand('layer.reorder', (payload) => {
      const p = payload as {
        id: string
        index: number
      }
      ctx.editor.update((d) => {
        if (!Number.isInteger(p.index) || p.index < 0 || p.index >= d.layers.length)
          throw new Error('Invalid layer index')
        const layer = d.layers.find(l => l.id === p.id)
        if (layer?.locked)
          throw new Error('Layer is locked')
        if (!layer)
          throw new Error('Unknown layer')
        const layers = d.layers.filter(l => l.id !== p.id)
        layers.splice(p.index, 0, layer)
        return { ...d, layers }
      })
    })
    ctx.registerCommand('canvas.resize', (payload) => {
      const { width, height } = payload as Pick<ImageDocument, 'width' | 'height'>
      if (!Number.isInteger(width) || !dimension(width) || !Number.isInteger(height) || !dimension(height))
        throw new Error('画板宽高须为 1 到 32768 之间的整数')
      ctx.editor.update(d => {
        const next = { ...d, width, height }
        if (d.crop && (d.crop.x + d.crop.width > width || d.crop.y + d.crop.height > height))
          delete next.crop
        return next
      })
    })
    ctx.registerCommand('canvas.background', payload => ctx.editor.update(d => {
      const next = { ...d }
      if (payload === null)
        delete next.background
      else
        next.background = payload as string
      return next
    }))
    ctx.registerCommand('image.crop', payload => ctx.editor.update(d => ({ ...d, crop: payload as ImageDocument['crop'] })))
  },
}
export interface ImageLayerRenderer {
  type: string
  assets?: (layer: ImageLayer) => string[]
  draw: (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, layer: ImageLayer, assets: ReadonlyMap<string, CanvasImageSource>) => void
}
export const imageCanvasPlugin: ImagePlugin = {
  name: 'image.canvas2d',
  install(ctx) {
    const renderers: ImageLayerRenderer[] = [
      {
        type: 'image',
        assets: layer => [layer.assetId!],
        draw(c, layer, assets) {
          c.drawImage(assets.get(layer.assetId!)!, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
        },
      },
      {
        type: 'solid',
        draw(c, layer) {
          c.fillStyle = layer.color!
          c.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height)
        },
      },
      {
        type: 'text',
        draw(c, layer) {
          c.fillStyle = layer.color!
          const size = layer.fontSize!
          c.font = `${layer.bold ? 'bold ' : ''}${size}px ${layer.fontFamily || 'sans-serif'}`
          c.textBaseline = 'top'
          const vertical = layer.direction === 'vertical'
          const lines = vertical
            ? Array.from(layer.text!)
            : layer.text!.split('\n')
          lines.forEach((line, i) => {
            const x = -layer.width / 2
            const y = -layer.height / 2 + i * size * 1.2
            if (layer.stroke) {
              c.strokeStyle = layer.stroke
              c.lineWidth = Math.max(1, size / 16)
              c.strokeText(line, x, y, layer.width)
            }
            c.fillText(line, x, y, layer.width)
            if (layer.underline)
              c.fillRect(x, y + size, Math.min(layer.width, c.measureText(line).width), Math.max(1, size / 20))
          })
        },
      },
    ]
    for (const renderer of renderers)
      ctx.register('image.layer', renderer.type, renderer)
    const render = async (request: RenderRequest) => {
      const editor = ctx.editor
      editor.assertActive()
      const doc = editor.document
      const revision = editor.revision
      const pluginRevision = editor.plugins.revision
      const signal = AbortSignal.any([
        ctx.signal,
        editor.signal,
        ...(request.signal
          ? [request.signal]
          : []),
      ])
      signal.throwIfAborted()
      const layerRenderers = new Map(doc.layers.filter(layer => layer.visible).map((layer) => {
        const renderer = editor.plugins.get<ImageLayerRenderer>('image.layer', layer.type)
        if (!renderer)
          throw new Error(`Unknown image layer renderer: ${layer.type}`)
        return [layer.id, renderer] as const
      }))
      const assets = new Map<string, CanvasImageSource>()
      await Promise.all([
        ...new Set(doc.layers.filter(layer => layer.visible).flatMap(layer => layerRenderers.get(layer.id)!.assets?.(layer) ?? [])),
      ].map(async (id) => {
        assets.set(id, await request.resolveAsset(id, signal))
      }))
      signal.throwIfAborted()
      editor.assertActive()
      if (revision !== editor.revision || pluginRevision !== editor.plugins.revision)
        throw new Error('Image document or renderer changed during rendering')
      const c = request.context
      const crop = doc.crop ?? {
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
      }
      c.save()
      try {
        c.resetTransform()
        c.clearRect(0, 0, c.canvas.width, c.canvas.height)
        c.beginPath()
        c.rect(0, 0, crop.width, crop.height)
        c.clip()
        if (doc.background) {
          c.fillStyle = doc.background
          c.fillRect(0, 0, crop.width, crop.height)
        }
        c.translate(-crop.x, -crop.y)
        for (const layer of doc.layers) {
          if (!layer.visible)
            continue
          c.save()
          try {
            c.globalAlpha = layer.opacity
            c.globalCompositeOperation = layer.blend
            const position = request.previewPosition?.id === layer.id
              ? request.previewPosition
              : layer
            c.translate(position.x + layer.width / 2, position.y + layer.height / 2)
            c.rotate(layer.rotation * Math.PI / 180)
            layerRenderers.get(layer.id)!.draw(c, layer, assets)
          }
          finally {
            c.restore()
          }
        }
      }
      finally {
        c.restore()
      }
    }
    ctx.registerCommand('image.render', payload => render(payload as RenderRequest))
    ctx.registerCommand('image.export', async (payload) => {
      const request = payload as ExportRequest
      const doc = ctx.editor.document
      const revision = ctx.editor.revision
      const signal = AbortSignal.any([
        ctx.signal,
        ctx.editor.signal,
        ...request.signal
          ? [request.signal]
          : [],
      ])
      const finish = (blob: Blob) => {
        signal.throwIfAborted()
        ctx.editor.assertActive()
        if (ctx.editor.revision !== revision)
          throw new Error('Image changed during export')
        return blob
      }
      const width = doc.crop?.width ?? doc.width
      const height = doc.crop?.height ?? doc.height
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height))
        const context = canvas.getContext('2d')
        if (!context)
          throw new Error('Canvas2D is unavailable')
        await render({ ...request, context })
        return finish(await canvas.convertToBlob({ type: request.type ?? 'image/png', quality: request.quality }))
      }
      if (typeof document === 'undefined')
        throw new Error('Image export requires a browser or OffscreenCanvas')
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(width)
      canvas.height = Math.ceil(height)
      const context = canvas.getContext('2d')
      if (!context)
        throw new Error('Canvas2D is unavailable')
      await render({ ...request, context })
      return finish(await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob
        ? resolve(blob)
        : reject(new Error('Image encoding failed')), request.type ?? 'image/png', request.quality)))
    })
  },
}
export interface ImageAiAdapter {
  generate: (request: {
    instruction: string
    document: ImageDocument
    signal: AbortSignal
  }) => Promise<{
    assetId: string
  }>
}
export function createImageAiPlugin(adapter: ImageAiAdapter): ImagePlugin {
  return {
    name: 'image.ai',
    requires: ['image.layers'],
    install(ctx) {
      ctx.registerCommand('image.ai', async (payload) => {
        const request = payload as {
          instruction: string
          signal?: AbortSignal
        }
        if (!request.instruction?.trim())
          throw new Error('AI instruction is required')
        const document = ctx.editor.document
        const revision = ctx.editor.revision
        const signal = AbortSignal.any([
          ctx.signal,
          ctx.editor.signal,
          ...(request.signal
            ? [request.signal]
            : []),
        ])
        signal.throwIfAborted()
        const result = await adapter.generate({ instruction: request.instruction, document, signal })
        signal.throwIfAborted()
        ctx.editor.assertActive()
        if (ctx.editor.revision !== revision)
          throw new Error('Image document changed during AI generation')
        ctx.editor.execute('layer.add', {
          id: crypto.randomUUID(),
          type: 'image',
          assetId: result.assetId,
          x: 0,
          y: 0,
          width: document.width,
          height: document.height,
          rotation: 0,
          opacity: 1,
          visible: true,
          blend: 'source-over',
        })
        return result
      })
    },
  }
}
export const DEFAULT_IMAGE_PLUGINS = [imageLayersPlugin, imageCanvasPlugin]
export class ImageEditor extends StateEditor<ImageDocument> {
  constructor(options: {
    document?: ImageDocument
    plugins?: ImagePlugin[]
  } = {}) {
    super(options.document ?? {
      format: 'site.image-document',
      version: 1,
      id: crypto.randomUUID(),
      width: 1024,
      height: 1024,
      layers: [],
    }, parseImageDocument, options.plugins ?? DEFAULT_IMAGE_PLUGINS)
  }
}

export { exportPsd, hitLayer, importPsd, layerFormat } from './design.js'
export { mountImageWorkbench } from './workbench.js'
