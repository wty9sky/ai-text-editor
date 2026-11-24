import type { ImageDocument, ImageLayer } from './index.js'
import { readPsd, writePsd } from 'ag-psd'

export function hitLayer(doc: ImageDocument, x: number, y: number) {
  for (const layer of [...doc.layers].reverse()) {
    if (!layer.visible || layer.locked)
      continue
    const a = -layer.rotation * Math.PI / 180
    const dx = x - layer.x - layer.width / 2
    const dy = y - layer.y - layer.height / 2
    if (Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= layer.width / 2 && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= layer.height / 2)
      return layer
  }
}

export function layerFormat(layer: ImageLayer) {
  const style: Partial<ImageLayer> = { opacity: layer.opacity, blend: layer.blend }
  if (layer.type === 'text') {
    Object.assign(style, {
      bold: !!layer.bold,
      underline: !!layer.underline,
      direction: layer.direction || 'horizontal',
      fontFamily: layer.fontFamily || 'sans-serif',
      stroke: layer.stroke || '',
      fontSize: layer.fontSize,
    })
  }
  if (layer.color)
    style.color = layer.color
  return style
}

export function importPsd(bytes: ArrayBuffer) {
  const psd = readPsd(bytes)
  const layers: ImageLayer[] = []
  const assets = new Map<string, HTMLCanvasElement>()
  for (const item of psd.children?.length
    ? psd.children
    : [
        { canvas: psd.canvas },
      ]) {
    if (item.children || item.mask || item.effects || item.clipping || item.adjustment)
      throw new Error('此 PSD 含图层组、蒙版或效果，请先在副本中栅格化相关图层')
    if (!item.canvas)
      throw new Error('图层缺少可读取的像素')
    const blend = item.blendMode || 'normal'
    if (!['normal', 'multiply', 'screen'].includes(blend))
      throw new Error('暂不支持此混合模式')
    const id = crypto.randomUUID()
    assets.set(id, item.canvas)
    layers.push({
      id,
      type: 'image',
      assetId: id,
      name: item.name || '图片',
      x: item.left || 0,
      y: item.top || 0,
      width: item.canvas.width,
      height: item.canvas.height,
      visible: !item.hidden,
      opacity: item.opacity ?? 1,
      blend: blend === 'normal'
        ? 'source-over'
        : blend as ImageLayer['blend'],
      rotation: 0,
    })
  }
  const document: ImageDocument = {
    format: 'site.image-document',
    version: 1,
    id: crypto.randomUUID(),
    width: psd.width,
    height: psd.height,
    layers,
  }
  return { document, assets }
}

export function exportPsd(doc: ImageDocument, rasterize: (layer: ImageLayer) => Promise<HTMLCanvasElement>, composite: HTMLCanvasElement) {
  const layers = [...doc.layers]
  if (doc.background) {
    layers.unshift({
      id: crypto.randomUUID(), name: '画板背景', type: 'solid', color: doc.background,
      x: 0, y: 0, width: doc.width, height: doc.height,
      visible: true, rotation: 0, opacity: 1, blend: 'source-over',
    })
  }
  return Promise.all(layers.map(async layer => ({
    name: layer.name || layer.text || layer.type,
    hidden: !layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blend === 'source-over'
      ? 'normal' as const
      : layer.blend,
    canvas: await rasterize(layer),
  }))).then(children => writePsd({
    width: doc.width,
    height: doc.height,
    canvas: composite,
    children,
  }, { trimImageData: true }))
}
