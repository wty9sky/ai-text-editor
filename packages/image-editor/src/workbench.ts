import type { ImageDocument, ImageLayer } from './index.js'
import { exportPsd, hitLayer, importPsd, layerFormat } from './design.js'
import { ImageEditor } from './index.js'

import { mountViewport } from './viewport.js'

export function mountImageWorkbench(host: HTMLElement, initial?: ImageDocument) {
  const editor = new ImageEditor({ document: initial || {
    format: 'site.image-document',
    version: 1,
    id: crypto.randomUUID(),
    width: 960,
    height: 540,
    layers: [],
  } })
  const root = document.createElement('section')
  root.className = 'image-workbench'
  root.innerHTML = `
    <header class="image-tools"><strong>未命名</strong></header>
    <div class="image-layout">
      <nav class="image-rail" aria-label="工具分类"></nav>
      <section class="image-library" aria-label="素材工具"><input class="image-search" type="search" aria-label="搜索素材"><strong></strong><div></div></section>
      <div class="image-desk">
        <div class="image-stage"><canvas aria-label="图片画布"></canvas></div>
        <span class="image-board-count">画板　1/1</span>
        <div class="image-view" role="group" aria-label="画布视图"></div>
      </div>
      <aside class="image-inspector">
        <strong class="image-tab-title">画板</strong>
        <div class="image-dimensions"><b>尺寸</b><span></span></div>
        <details class="image-resize">
          <summary>调整尺寸</summary>
          <form class="image-size">
            <label>宽度<input name="width" type="number" min="1" max="32768" required></label>
            <label>高度<input name="height" type="number" min="1" max="32768" required></label>
            <button type="submit">应用尺寸</button>
          </form>
        </details>
        <section class="image-background-section">
          <strong>背景</strong>
          <div class="image-background"><label>背景色<input type="color"></label></div>
        </section>
        <strong>图层</strong><div class="image-layers"></div><div class="image-properties"></div>
      </aside>
    </div><output role="status"></output>`
  host.append(root)
  const canvas = root.querySelector('canvas')!
  const tools = root.querySelector<HTMLElement>('.image-tools')!
  const list = root.querySelector<HTMLElement>('.image-layers')!
  const properties = root.querySelector<HTMLElement>('.image-properties')!
  const status = root.querySelector('output')!
  const library = root.querySelector<HTMLElement>('.image-library')!
  const stage = root.querySelector<HTMLElement>('.image-stage')!
  const viewport = mountViewport(stage, canvas, root.querySelector<HTMLElement>('.image-view')!)
  const size = root.querySelector<HTMLFormElement>('.image-size')!
  const width = size.elements.namedItem('width') as HTMLInputElement
  const height = size.elements.namedItem('height') as HTMLInputElement
  const background = root.querySelector<HTMLElement>('.image-background')!
  const color = background.querySelector('input')!
  color.onchange = () => editor.execute('canvas.background', color.value)
  action(background, '透明背景', () => editor.execute('canvas.background', null))
  size.onsubmit = (event) => {
    event.preventDefault()
    editor.execute('canvas.resize', { width: width.valueAsNumber, height: height.valueAsNumber })
    const disclosure = size.closest('details')!
    disclosure.open = false
    disclosure.querySelector('summary')!.focus()
  }
  const assets = new Map<string, CanvasImageSource>()
  let selected = editor.document.layers.at(-1)?.id
  let brush: Partial<ImageLayer> | undefined
  let drag: { id: string, x: number, y: number, left: number, top: number, pointer: number } | undefined
  const current = () => editor.document.layers.find(l => l.id === selected)
  const resolveAsset = async (id: string) => {
    const value = assets.get(id)
    if (!value)
      throw new Error('图片资源不可用')
    return value
  }
  function action(parent: HTMLElement, title: string, run: () => unknown) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = title
    button.onclick = async () => {
      try {
        status.textContent = ''
        await run()
      }
      catch (error) { status.textContent = String(error) }
    }
    parent.append(button)
    return button
  }
  function update(patch: Partial<ImageLayer>) {
    if (current() && !current()!.locked)
      editor.execute('layer.update', { id: selected, patch })
  }
  function add(type: string, patch: Partial<ImageLayer>) {
    selected = crypto.randomUUID()
    editor.execute('layer.add', {
      id: selected,
      type,
      x: 40,
      y: 40,
      width: 300,
      height: 140,
      color: '#4472c4',
      rotation: 0,
      opacity: 1,
      visible: true,
      blend: 'source-over',
      ...patch,
    })
  }
  function input(label: string, type: string, value: string, change: (v: string) => void) {
    const wrap = document.createElement('label')
    wrap.textContent = label
    const field = document.createElement('input')
    field.type = type
    field.value = value
    field.onchange = () => {
      try {
        change(field.value)
      }
      catch (error) { status.textContent = String(error) }
    }
    wrap.append(field)
    properties.append(wrap)
  }
  let drawId = 0
  async function draw(previewPosition?: { id: string, x: number, y: number }) {
    const ticket = ++drawId
    try {
      await editor.execute('image.render', {
        context: canvas.getContext('2d'),
        resolveAsset,
        previewPosition,
      })
    }
    catch (error) {
      if (ticket === drawId && editor.state === 'ready')
        status.textContent = String(error)
    }
  }
  function refresh() {
    root.querySelector('.image-dimensions span')!.textContent = `${editor.document.width} × ${editor.document.height} px`
    width.value = String(editor.document.width)
    height.value = String(editor.document.height)
    color.value = editor.document.background || '#ffffff'
    canvas.width = editor.document.crop?.width ?? editor.document.width
    canvas.height = editor.document.crop?.height ?? editor.document.height
    viewport.layout()
    void draw()
    list.replaceChildren()
    properties.replaceChildren()
    for (const l of [...editor.document.layers].reverse()) {
      const b = action(list, `${l.visible ? '◉' : '○'} ${l.name || l.text || l.type}${l.locked ? ' 🔒' : ''}`, () => {
        selected = l.id
        refresh()
      })
      b.setAttribute('aria-pressed', String(l.id === selected))
    }
    history.replaceChildren()
    for (let i = 0; i < editor.historyLength; i++) {
      const option = document.createElement('option')
      option.value = String(i)
      option.textContent = i === 0
        ? '最早保留的状态'
        : `第 ${i} 步`
      history.append(option)
    }
    history.value = String(editor.historyPosition)
    undo.disabled = !editor.canUndo
    redo.disabled = !editor.canRedo
    const l = current()
    if (!l)
      return
    action(properties, l.locked ? '解锁' : '锁定', () => editor.execute('layer.update', {
      id: l.id,
      patch: { locked: !l.locked },
    }))
    if (l.locked)
      return
    input('图层名称', 'text', l.name || '', name => update({ name }))
    action(properties, l.visible ? '隐藏' : '显示', () => update({ visible: !l.visible }))
    const index = editor.document.layers.indexOf(l)
    for (const [label, n] of [
      ['上移', 1],
      ['下移', -1],
    ] as const) {
      const target = index + n
      action(properties, label, () => editor.execute('layer.reorder', { id: l.id, index: target })).disabled = target < 0 || target >= editor.document.layers.length
    }
    action(properties, '复制图层', () => {
      selected = editor.execute<string>('layer.duplicate', l.id)
      refresh()
    })
    action(properties, '删除图层', () => editor.execute('layer.remove', l.id))
    input('X', 'number', String(l.x), v => update({
      x: Number(v),
    }))
    input('Y', 'number', String(l.y), v => update({
      y: Number(v),
    }))
    input('旋转角度', 'number', String(l.rotation), v => update({
      rotation: Number(v),
    }))
    input('透明度（0–1）', 'number', String(l.opacity), v => update({
      opacity: Number(v),
    }))
    if (l.color)
      input('填充颜色', 'color', l.color, color => update({ color }))
    if (l.type === 'text') {
      input('文字', 'text', l.text!, text => update({ text }))
      input('字号', 'number', String(l.fontSize), v => update({
        fontSize: Number(v),
      }))
      input('字体', 'text', l.fontFamily || 'sans-serif', fontFamily => update({ fontFamily }))
      input('描边', 'color', l.stroke || '#222222', stroke => update({ stroke }))
      action(properties, '清除描边', () => update({ stroke: '' }))
      action(properties, '加粗', () => update({ bold: !l.bold }))
      action(properties, '下划线', () => update({ underline: !l.underline }))
      action(properties, '横排 / 竖排', () => update({
        direction: l.direction === 'vertical'
          ? 'horizontal'
          : 'vertical',
      }))
    }
    action(properties, '取格式', () => {
      brush = layerFormat(l)
      refresh()
      status.textContent = '请选择目标图层并应用格式'
    })
    action(properties, '应用格式', () => {
      if (brush)
        update(brush)
    }).disabled = !brush
  }
  const history = document.createElement('select')
  history.setAttribute('aria-label', '历史记录')
  history.onchange = () => {
    const target = Number(history.value)
    while (editor.historyPosition > target) editor.undo()
    while (editor.historyPosition < target) editor.redo()
  }
  tools.append(history)
  const undo = action(tools, '撤销', () => editor.undo())
  const redo = action(tools, '重做', () => editor.redo())
  const rail = root.querySelector<HTMLElement>('.image-rail')!
  const libraryTitle = library.querySelector('strong')!
  const libraryBody = library.querySelector('div')!
  const panels = new Map<string, HTMLElement>()
  const search = library.querySelector('input')!
  function filterPanel() {
    const query = search.value.trim()
    for (const button of Array.from(libraryBody.querySelectorAll('button')))
      button.hidden = !button.textContent?.includes(query)
  }
  search.oninput = filterPanel
  function showPanel(name: string) {
    search.value = ''
    search.placeholder = `搜索${name}`
    filterPanel()
    libraryTitle.textContent = name === '文字' ? '添加文字' : name
    for (const [key, panel] of panels)
      panel.hidden = key !== name
    for (const button of Array.from(rail.querySelectorAll('button')))
      button.setAttribute('aria-pressed', String(button.textContent === name))
  }
  function panel(name: string, symbol: string) {
    const content = document.createElement('div')
    libraryBody.append(content)
    panels.set(name, content)
    const button = action(rail, name, () => showPanel(name))
    button.dataset.tool = symbol
    return content
  }
  const quick = panel('添加', 'add')
  const templates = panel('模板', 'template')
  const shapes = panel('素材', 'shape')
  const texts = panel('文字', 'text')
  const images = panel('图片', 'photo')
  const backgrounds = panel('背景', 'background')
  action(quick, '添加文字', () => add('text', { name: '文字', text: '输入文字', fontSize: 36 }))
  action(quick, '添加色块', () => add('solid', { name: '色块' }))
  action(backgrounds, '设置背景色', () => color.click())
  action(backgrounds, '透明背景', () => editor.execute('canvas.background', null))
  const gallery = document.createElement('section')
  gallery.className = 'image-gallery'
  texts.append(gallery)
  const shortcuts = document.createElement('div')
  shortcuts.className = 'image-shortcuts'
  texts.prepend(shortcuts)
  for (const [group, samples] of [
    ['热门', ['春日来信', '一起出发', '灵感日记']],
    ['毕业季', ['毕业快乐', '青春纪念册', '奔赴山海']],
    ['基础', ['主标题', '小标题', '正文']],
  ] as const) {
    const heading = document.createElement('strong')
    heading.textContent = group
    gallery.append(heading)
    const row = document.createElement('div')
    gallery.append(row)
    for (const [index, text] of samples.entries()) {
      const fontFamily = index === 1 ? 'sans-serif' : 'serif'
      const ink = ['#222529', '#2254f4', '#983f38'][index]
      const insert = () => add('text', { name: text, text, fontSize: 52, bold: true, fontFamily, color: ink })
      for (const parent of [row, templates]) {
        const sample = action(parent, text, insert)
        sample.className = 'image-type-sample'
        sample.style.fontFamily = fontFamily
        sample.style.color = ink
      }
    }
  }
  showPanel('文字')
  action(shapes, '添加色块', () => add('solid', { name: '色块' }))
  action(shortcuts, '添加文字', () => add('text', { name: '文字', text: '输入文字', fontSize: 36 }))
  action(shortcuts, '标题模板', () => add('text', {
    name: '海报标题',
    text: '主题标题',
    fontSize: 64,
    bold: true,
    fontFamily: 'serif',
    color: '#18375e',
    underline: true,
  }))
  for (const [name, fontSize] of [['副标题', 40], ['正文', 24]] as const)
    action(shortcuts, name, () => add('text', { name, text: name, fontSize, color: '#222222' }))
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = 'image/*,.psd'
  file.hidden = true
  root.append(file)
  action(images, '打开图片 / PSD', () => file.click())
  file.onchange = async () => {
    const f = file.files?.[0]
    file.value = ''
    if (!f)
      return
    try {
      if (/\.psd$/i.test(f.name)) {
        const bytes = await f.arrayBuffer()
        if (editor.state !== 'ready')
          return
        const result = importPsd(bytes)
        for (const [id, asset] of result.assets) assets.set(id, asset)
        selected = result.document.layers.at(-1)?.id
        editor.load(result.document)
      }
      else {
        const image = await createImageBitmap(f)
        if (editor.state !== 'ready') {
          image.close()
          return
        }
        const id = crypto.randomUUID()
        assets.set(id, image)
        const scale = Math.min(1, editor.document.width / image.width, editor.document.height / image.height)
        add('image', {
          assetId: id,
          name: f.name,
          width: image.width * scale,
          height: image.height * scale,
        })
      }
    }
    catch (error) { status.textContent = String(error) }
  }
  function save(blob: Blob, name: string) {
    if (editor.state !== 'ready')
      return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  action(tools, '导出 PNG', async () => save(await editor.execute<Promise<Blob>>('image.export', { resolveAsset }), 'image.png'))
  action(tools, '导出 PSD', async () => {
    const doc = editor.document
    const composite = document.createElement('canvas')
    composite.width = doc.width
    composite.height = doc.height
    const full = new ImageEditor({ document: { ...doc, crop: undefined } })
    try {
      await full.execute('image.render', { context: composite.getContext('2d'), resolveAsset })
    }
    finally { full.destroy() }
    const bytes = await exportPsd(doc, async (layer) => {
      const temp = new ImageEditor({
        document: {
          ...doc,
          background: undefined,
          crop: undefined,
          layers: [
            {
              ...layer,
              visible: true,
              opacity: 1,
              blend: 'source-over',
            },
          ],
        },
      })
      const surface = document.createElement('canvas')
      surface.width = doc.width
      surface.height = doc.height
      try {
        await temp.execute('image.render', {
          context: surface.getContext('2d'),
          resolveAsset,
        })
        return surface
      }
      finally { temp.destroy() }
    }, composite)
    save(new Blob([bytes]), 'image.psd')
  })
  function point(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * canvas.width / rect.width, y: (e.clientY - rect.top) * canvas.height / rect.height }
  }
  canvas.onpointerdown = (e) => {
    if (e.button !== 0 || drag)
      return
    const p = point(e)
    const l = hitLayer(editor.document, p.x + (editor.document.crop?.x ?? 0), p.y + (editor.document.crop?.y ?? 0))
    selected = l?.id
    refresh()
    if (!l)
      return
    drag = {
      id: l.id,
      ...p,
      left: l.x,
      top: l.y,
      pointer: e.pointerId,
    }
    canvas.setPointerCapture(e.pointerId)
  }
  canvas.onpointermove = (e) => {
    if (!drag || e.pointerId !== drag.pointer)
      return
    const p = point(e)
    void draw({ id: drag.id, x: drag.left + p.x - drag.x, y: drag.top + p.y - drag.y })
  }
  canvas.onpointerup = (e) => {
    if (!drag || e.pointerId !== drag.pointer)
      return
    const p = point(e)
    update({ x: drag.left + p.x - drag.x, y: drag.top + p.y - drag.y })
    drag = undefined
  }
  canvas.onlostpointercapture = () => {
    drag = undefined
    void draw()
  }
  const off = editor.on((event) => {
    if (event === 'change')
      refresh()
  })
  refresh()
  return {
    editor,
    destroy() {
      viewport.destroy()
      off()
      editor.destroy()
      for (const image of assets.values()) {
        if ('close' in image)
          image.close()
      }
      assets.clear()
      root.remove()
    },
  }
}
