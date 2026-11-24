/* eslint-disable antfu/no-import-dist -- Integration test deliberately exercises built package artifacts. */
import React, { createRef, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, h, nextTick, ref as vueState } from 'vue'
import { exportPsd, importPsd, ImageEditor } from '../../image-editor/dist/index.js'
import { createDocEditorSession as createReactSession, DocEditorContent as ReactContent, DocEditor as ReactEditor, ImageEditor as ReactImage, ToolBar as ReactToolBar } from '../../react/dist/index.js'
import { createDocEditorSession as createVueSession, DocEditorContent as VueContent, DocEditor as VueEditor, ImageEditor as VueImage, ToolBar as VueToolBar } from '../dist/index.js'
import '../dist/style.css'
import '../../react/dist/style.css'

const results: string[] = []
const wait = () => new Promise(resolve => setTimeout(resolve, 100))
function check(condition: unknown, message: string) {
  if (!condition)
    throw new Error(message)
  results.push(message)
  document.querySelector('#result')!.textContent = JSON.stringify({ results })
}
async function checkTextEditing(host: HTMLElement, editor: any, name: string) {
  const editable = () => host.querySelector<HTMLElement>('[contenteditable]')!
  check(!host.querySelector('textarea') && !!editable(), `${name} uses contenteditable instead of textarea`)
  let el = editable()
  el.focus()
  el.textContent = 'hello world'
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await wait()
  check(editor.blocks[0].text === 'hello world', `${name} contenteditable input updates SDK`)
  const range = document.createRange()
  range.setStart(el.firstChild!, 5)
  range.setEnd(el.firstChild!, 6)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  await wait()
  check(editor.blocks.length === 2 && editor.blocks[0].text === 'hello' && editor.blocks[1].text === 'world', `${name} Enter splits text using DOM selection`)
  const focused = document.activeElement as HTMLElement
  focused.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', ctrlKey: true }))
  await wait()
  check(editor.blocks.length === 1 && editor.blocks[0].text === 'hello world', `${name} keyboard undo restores one split transaction`)
  el = editable()
  el.focus()
  el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  el.textContent = '中文输入'
  el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
  check(editor.blocks[0].text === 'hello world', `${name} keeps intermediate composition out of SDK`)
  el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文输入' }))
  await wait()
  check(editor.blocks[0].text === '中文输入', `${name} commits completed composition`)
  el.textContent = ''
  const clipboard = new DataTransfer()
  clipboard.setData('text/plain', 'safe paste')
  clipboard.setData('text/html', '<img src=x onerror=alert(1)>')
  el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
  await wait()
  check(editor.blocks[0].text === 'safe paste' && !el.querySelector('img'), `${name} pastes plain text without HTML`)
  const size = host.querySelector<HTMLSelectElement>('[aria-label="文字大小"]')!
  size.value = '24'
  size.dispatchEvent(new Event('change', { bubbles: true }))
  await wait()
  check(editor.blocks[0].props?.textStyle?.fontSize === 24 && editable().style.fontSize === '24px', `${name} font-size toolbar persists and renders style`)
  host.querySelector<HTMLButtonElement>('[aria-label="粗体"]')!.click()
  await wait()
  check(editor.blocks[0].props?.textStyle?.bold === true, `${name} bold toolbar uses SDK formatting`)
  editor.undo()
  await wait()
  check(!editor.blocks[0].props?.textStyle?.bold, `${name} formatting participates in undo history`)
  const stop = editor.hooks.on('transaction:beforeCommit', () => ({ allow: false, code: 'DENY_EDIT' }))
  el = editable()
  el.textContent = 'rejected edit'
  el.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await wait()
  check(editor.blocks[0].text === 'safe paste' && editable().textContent === 'safe paste', `${name} rejected edit restores DOM from SDK`)
  stop()
}
async function checkContextMenu(host: HTMLElement, editor: any, name: string) {
  host.querySelector('[data-block-id]')!.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: innerWidth - 4,
    clientY: innerHeight - 4,
  }))
  await wait()
  const menu = host.querySelector<HTMLElement>('[data-editor-menu]')!
  const item = menu.querySelector<HTMLElement>('.sword-menu-item')!
  const rect = menu.getBoundingClientRect()
  check(getComputedStyle(menu).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(item).padding === '7px 10px', `${name} context menu has an opaque surface and padded rows`)
  check(getComputedStyle(item).display === 'flex' && getComputedStyle(item).gap === '10px' && getComputedStyle(item.querySelector('svg')!).width === '16px', `${name} context menu aligns icons and labels`)
  check(rect.right <= innerWidth && rect.bottom <= innerHeight && rect.left >= 0 && rect.top >= 0, `${name} context menu stays inside the viewport`)
  const shell = host.querySelector<HTMLElement>('.sword-editor')!
  shell.dataset.theme = 'dark'
  check(getComputedStyle(menu).backgroundColor === 'rgb(23, 23, 26)', `${name} context menu keeps an opaque dark theme surface`)
  delete shell.dataset.theme
  const scroll = menu.querySelector<HTMLElement>('.sword-menu-scroll')!
  check(Math.round(rect.height) === 320 && scroll.scrollHeight > scroll.clientHeight && getComputedStyle(scroll).scrollbarWidth === 'thin', `${name} context menu uses fixed height and a thin inner scrollbar`)
  const duplicate = [
    ...menu.querySelectorAll('button'),
  ].find(button => button.textContent?.trim() === '复制')!
  duplicate.click()
  await wait()
  check(editor.blocks.length === 2 && !host.querySelector('[data-editor-menu]'), `${name} context menu action runs and closes the menu`)
  editor.undo()
  await wait()
}
async function checkAddMenuAndMarquee(host: HTMLElement, editor: any, name: string) {
  host.querySelector<HTMLButtonElement>('[title="插入块"]')!.click()
  await wait()
  const menu = host.querySelector<HTMLElement>('.sword-add-menu')!
  check(getComputedStyle(host.querySelector('.sword-insert-trigger')!).opacity === '1', `${name} open add menu remains visible when the block is not hovered`)
  const scroll = menu.querySelector<HTMLElement>('.sword-menu-scroll')!
  const row = menu.querySelector<HTMLElement>('.sword-menu-item')!
  check(Math.round(menu.getBoundingClientRect().height) === 320 && getComputedStyle(menu).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(row).padding === '7px 10px', `${name} add menu shares the context menu surface, height and row layout`)
  check(scroll.scrollHeight > scroll.clientHeight && Math.abs(scroll.getBoundingClientRect().right - menu.getBoundingClientRect().right) <= 2 && getComputedStyle(scroll).scrollbarWidth === 'thin', `${name} add menu scrollbar is thin and flush to the panel edge`)
  ;[
    ...menu.querySelectorAll('button'),
  ].find(button => button.textContent?.trim() === '二级标题')!.click()
  await wait()
  check(editor.blocks.some((block: any) => block.type === 'h2') && !host.querySelector('.sword-add-menu'), `${name} add menu inserts a block and closes`)
  editor.undo()
  await wait()
  const canvas = host.querySelector('[data-block-id]')!.parentElement!
  canvas.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 20,
    clientY: 20,
  }))
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 80, clientY: 80 }))
  await wait()
  const marquee = host.querySelector<HTMLElement>('.sword-selection-marquee')!
  check(!!marquee && getComputedStyle(marquee).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(marquee).borderTopStyle === 'dashed', `${name} selection marquee is transparent with a visible border`)
  window.dispatchEvent(new MouseEvent('mouseup'))
  await wait()
}
async function checkBlockInteractions(host: HTMLElement, editor: any, name: string) {
  editor.setBlocks(['first', 'second', 'third'].map((text, index) => ({ id: `selection-${name}-${index}`, type: 'paragraph', text })))
  editor.clearSelection()
  await wait()
  const ids = editor.blocks.map((block: any) => block.id)
  const blocks = () => [
    ...host.querySelectorAll<HTMLElement>('[data-block-id]'),
  ]
  const pointer = (index: number, options: MouseEventInit = {}) => blocks()[index].querySelector('[contenteditable]')!.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...options,
  }))
  pointer(0, { ctrlKey: true })
  pointer(2, { ctrlKey: true })
  await wait()
  check(editor.selection.length === 2 && editor.selection.includes(ids[0]) && editor.selection.includes(ids[2]), `${name} Ctrl click toggles nonadjacent blocks`)
  pointer(2, { ctrlKey: true })
  await wait()
  check(editor.selection.length === 1, `${name} Ctrl click deselects a selected block`)
  pointer(0)
  pointer(2, { shiftKey: true })
  await wait()
  check(editor.selection.length === 3, `${name} Shift click selects an anchored block range`)
  const open = async (index: number, x: number, y: number) => {
    blocks()[index].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }))
    blocks()[index].dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    }))
    await wait()
    await wait()
  }
  const oldOverflow = document.documentElement.style.overflow
  await open(1, 100, 100)
  let menu = host.querySelector<HTMLElement>('.sword-context-menu')!
  check(editor.selection.length === 3 && menu.textContent?.includes('已选 3 个块'), `${name} right mouse down preserves multiselection for batch actions`)
  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
  document.body.dispatchEvent(wheel)
  check(wheel.defaultPrevented && document.documentElement.style.overflow === 'hidden' && document.body.style.overflow === 'hidden', `${name} context menu locks background scrolling`)
  const scroll = menu.querySelector<HTMLElement>('.sword-menu-scroll')!
  const insideWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
  scroll.dispatchEvent(insideWheel)
  check(!insideWheel.defaultPrevented, `${name} context menu still allows scrolling its own items`)
  scroll.scrollTop = scroll.scrollHeight
  const boundaryWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
  scroll.dispatchEvent(boundaryWheel)
  check(boundaryWheel.defaultPrevented, `${name} menu scroll boundary cannot scroll the background`)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await wait()
  check(document.documentElement.style.overflow === oldOverflow, `${name} closing a menu restores previous overflow`)
  editor.clearSelection()
  await open(0, 100, 100)
  menu = host.querySelector<HTMLElement>('.sword-context-menu')!
  await open(2, 260, 180)
  const retargeted = host.querySelector<HTMLElement>('.sword-context-menu')!
  check(menu === retargeted && retargeted.dataset.targetBlockId === ids[2] && editor.selection.length === 1 && editor.selection[0] === ids[2], `${name} right click retargets the existing menu to another block`)
  check(Number.parseFloat(retargeted.style.left) === Math.min(260, innerWidth - retargeted.offsetWidth - 8) && Number.parseFloat(retargeted.style.top) === Math.min(180, innerHeight - retargeted.offsetHeight - 8) && getComputedStyle(retargeted).transitionProperty.includes('left'), `${name} retargeted menu animates its new position`)
  const duplicate = [
    ...retargeted.querySelectorAll('button'),
  ].find(button => button.textContent?.trim() === '复制')!
  duplicate.click()
  await wait()
  check(editor.blocks.length === 4 && editor.blocks[3].text === 'third', `${name} retargeted menu acts on the new block`)
  editor.undo()
  await wait()
  pointer(0)
  const editable = blocks()[0].querySelector<HTMLElement>('[contenteditable]')!
  editable.focus()
  const key = (target: HTMLElement, value: string, modifiers: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: value,
      ...modifiers,
    })
    target.dispatchEvent(event)
    return event
  }
  check(!key(editable, 'Backspace').defaultPrevented && editor.blocks.length === 3, `${name} normal text Backspace retains native text behavior`)
  const first = key(editable, 'a', { ctrlKey: true })
  check(!first.defaultPrevented, `${name} first Ctrl A retains native text selection`)
  const second = key(editable, 'a', { ctrlKey: true })
  await wait()
  check(second.defaultPrevented && editor.selection.length === 3, `${name} quick second Ctrl A selects all blocks`)
  const canvas = host.querySelector<HTMLElement>('.sword-block-canvas')!
  key(canvas, 'Backspace')
  await wait()
  check(editor.blocks.length === 1 && editor.blocks[0].text === '', `${name} block Backspace deletes all selected blocks in one command`)
  key(canvas, 'z', { ctrlKey: true })
  await wait()
  check(editor.blocks.length === 3 && editor.blocks[2].text === 'third', `${name} keyboard undo restores a batch deletion`)
  key(canvas, 'z', { ctrlKey: true, shiftKey: true })
  await wait()
  check(editor.blocks.length === 1, `${name} keyboard redo reapplies batch deletion`)
  key(canvas, 'z', { ctrlKey: true })
  await wait()
  key(canvas, 'a', { metaKey: true })
  key(canvas, 'Delete')
  await wait()
  check(editor.blocks.length === 1, `${name} Cmd A and Delete support block operations`)
  key(canvas, 'z', { metaKey: true })
  await wait()
  const custom = document.createElement('input')
  custom.dataset.editorInteractive = ''
  blocks()[0].append(custom)
  key(custom, 'a', { ctrlKey: true })
  key(custom, 'a', { ctrlKey: true })
  const customDelete = key(custom, 'Backspace')
  check(!customDelete.defaultPrevented && editor.blocks.length === 3, `${name} custom interactive inputs retain their shortcuts`)
  custom.remove()
  key(canvas, 'Escape')
  check(editor.selection.length === 0, `${name} Escape clears block selection`)
  key(canvas, 'a', { ctrlKey: true })
  await wait()
  host.querySelector('[aria-label="粗体"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  check(editor.selection.length === 3, `${name} toolbar controls preserve multiple selected blocks`)
  const background = document.createElement('div')
  background.innerHTML = '<span>outside blank area</span>'
  document.body.append(background)
  background.firstElementChild!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }))
  check(editor.selection.length === 3, `${name} right click on the background preserves multiple selection`)
  background.firstElementChild!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  check(editor.selection.length === 0, `${name} left click on outside background clears multiple selection`)
  background.remove()
  key(canvas, 'a', { ctrlKey: true })
  canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  check(editor.selection.length === 0, `${name} clicking canvas whitespace clears multiple selection`)
  window.dispatchEvent(new MouseEvent('mouseup'))
  await wait()
}

async function checkDetached() {
  for (const framework of ['react', 'vue']) {
    const host = document.createElement('div')
    document.body.append(host)
    const session = framework === 'react'
      ? createReactSession()
      : createVueSession()
    let view: any
    let unmount: () => void
    if (framework === 'react') {
      const root = createRoot(host)
      const ref = createRef<any>()
      root.render(
        <StrictMode>
          <ReactToolBar session={session} />
          <ReactContent session={session} ref={ref} value="detached" />
        </StrictMode>,
      )
      await wait()
      await wait()
      view = ref.current
      unmount = () => root.unmount()
    }
    else {
      const app = createApp({
        render: () => [
          h(VueToolBar, { session }),
          h(VueContent, {
            session,
            ref: (value: any) => { view = value },
            modelValue: 'detached',
          }),
        ],
      })
      app.mount(host)
      await wait()
      unmount = () => app.unmount()
    }
    const editor = view.editor
    check(!!editor && host.querySelectorAll('[role="toolbar"]').length === 1 && host.querySelectorAll('.sword-block-canvas').length === 1, `${framework} detached siblings mount one toolbar and one editor without Provider`)
    editor.select([editor.blocks[0].id])
    await wait()
    const size = host.querySelector<HTMLSelectElement>('[aria-label="文字大小"]')!
    size.value = '24'
    size.dispatchEvent(new Event('change', { bubbles: true }))
    await wait()
    check(editor.blocks[0].props.textStyle.fontSize === 24 && host.querySelector<HTMLElement>('[contenteditable]')!.style.fontSize === '24px', `${framework} detached toolbar formats its associated document`)
    const other = framework === 'react'
      ? createReactSession()
      : createVueSession()
    check(other.getToolbar() === null && !!session.getToolbar(), `${framework} detached sessions have no global toolbar state`)
    unmount()
    await wait()
    check(editor.state === 'destroyed' && session.getToolbar() === null, `${framework} detached unmount releases SDK and toolbar host`)
    host.remove()
  }
}

async function run() {
  document.querySelector('#result')!.textContent = 'started'
  const reactHost = document.createElement('div')
  document.body.append(reactHost)
  const root = createRoot(reactHost)
  const ref = createRef<any>()
  const instances: any[] = []
  let installed = 0
  let disposed = 0
  const tracker = {
    name: 'test.lifecycle',
    install(ctx: any) {
      installed++
      instances.push(ctx.editor)
      return () => {
        disposed++
      }
    },
  }
  root.render(
    <StrictMode>
      <ReactEditor ref={ref} value="hello" plugins={[tracker]}>
        <header><ReactToolBar /></header>
        <main><ReactContent /></main>
      </ReactEditor>
    </StrictMode>,
  )
  await wait()
  await wait()
  check(!!ref.current && ref.current.editor.state === 'ready', 'React StrictMode exposes a live editor')
  check(installed - disposed === 1, 'React StrictMode leaves exactly one active plugin installation')
  const reactInstance = ref.current.editor
  reactInstance.plugins.use({
    name: 'test.renderer',
    install(ctx: any) {
      ctx.registerRenderer({
        id: 'paragraph',
        framework: 'react',
        component: ({ editor, block }: any) => <button data-test="react-custom" data-editor-interactive onClick={() => editor.transaction(() => editor.update(block.id, { text: 'custom edited' }))}>custom</button>,
      }, { override: true })
    },
  })
  await wait()
  check(!!reactHost.querySelector('[data-test="react-custom"]'), 'React dynamically installs an overriding renderer')
  reactHost.querySelector<HTMLButtonElement>('[data-test="react-custom"]')!.click()
  await wait()
  check(reactInstance.blocks[0].text === 'custom edited', 'React custom renderer receives SDK and edits through a transaction')
  reactInstance.plugins.remove('test.renderer')
  await wait()
  check(!reactHost.querySelector('[data-test="react-custom"]') && !!reactHost.querySelector('[contenteditable]'), 'React restores the built-in renderer after uninstall')
  await checkTextEditing(reactHost, reactInstance, 'React')
  await checkContextMenu(reactHost, reactInstance, 'React')
  await checkAddMenuAndMarquee(reactHost, reactInstance, 'React')
  await checkBlockInteractions(reactHost, reactInstance, 'React')
  reactInstance.update(reactInstance.blocks[0].id, { text: 'JSON controlled' })
  const json = reactInstance.toDocument()
  root.render(<StrictMode><ReactEditor ref={ref} document={json} /></StrictMode>)
  await wait()
  check(reactInstance.canUndo && reactInstance.blocks[0].text === 'JSON controlled', 'React JSON echo preserves history')
  root.unmount()
  await wait()
  check(installed === disposed && instances.every(e => e.state === 'destroyed'), 'React unmount destroys every StrictMode editor instance')
  const vueHost = document.createElement('div')
  document.body.append(vueHost)
  const vueDocument = vueState<any>(undefined)
  let vueRef: any
  const vue = createApp({
    render: () => h(VueEditor, {
      ref: (value: any) => {
        vueRef = value
      },
      modelValue: 'hello',
      document: vueDocument.value,
    }, {
      default: () => [
        h('header', [
          h(VueToolBar),
        ]),
        h('main', [
          h(VueContent),
        ]),
      ],
    }),
  })
  vue.config.warnHandler = () => {
  }
  vue.component('ADropdown', {
    setup(_p: any, { slots }: any) {
      return () => h('div', slots.default?.())
    },
  })
  vue.component('ADoption', {
    setup(_p: any, { slots }: any) {
      return () => h('span', slots.default?.())
    },
  })
  vue.mount(vueHost)
  await nextTick()
  const vueInstance = vueRef.editor
  check(vueInstance.state === 'ready' && !!vueHost.querySelector('[contenteditable]'), 'Vue mounts with the built-in renderer plugin')
  vueInstance.plugins.use({
    name: 'test.renderer',
    install(ctx: any) {
      ctx.registerRenderer({
        id: 'paragraph',
        framework: 'vue',
        component: {
          props: ['editor', 'block'],
          setup(props: any) {
            return () => h('button', {
              'data-test': 'vue-custom',
              'data-editor-interactive': '',
              'onClick': () => props.editor.transaction(() => props.editor.update(props.block.id, { text: 'custom edited' })),
            }, 'custom')
          },
        },
      }, { override: true })
    },
  })
  await nextTick()
  check(!!vueHost.querySelector('[data-test="vue-custom"]'), 'Vue dynamically installs an overriding renderer')
  vueHost.querySelector<HTMLButtonElement>('[data-test="vue-custom"]')!.click()
  await nextTick()
  check(vueInstance.blocks[0].text === 'custom edited', 'Vue custom renderer receives SDK and edits through a transaction')
  vueInstance.plugins.remove('test.renderer')
  await nextTick()
  check(!vueHost.querySelector('[data-test="vue-custom"]') && !!vueHost.querySelector('[contenteditable]'), 'Vue restores the built-in renderer after uninstall')
  await checkTextEditing(vueHost, vueInstance, 'Vue')
  await checkContextMenu(vueHost, vueInstance, 'Vue')
  await checkAddMenuAndMarquee(vueHost, vueInstance, 'Vue')
  await checkBlockInteractions(vueHost, vueInstance, 'Vue')
  const current = vueInstance.blocks[0]
  vueInstance.update(current.id, { text: 'changed' })
  await nextTick()
  check(!!vueHost.querySelector('button[title="撤销"]'), 'Vue toolbar reacts to history changes')
  vueDocument.value = vueInstance.toDocument()
  await nextTick()
  check(vueInstance.canUndo && vueInstance.blocks[0].text === 'changed', 'Vue JSON echo preserves history')
  const peerHost = document.createElement('div')
  document.body.append(peerHost)
  const peerRoot = createRoot(peerHost)
  const peerRef = createRef<any>()
  peerRoot.render(<ReactEditor ref={peerRef} value={'peer one\n\npeer two'} />)
  await wait()
  await wait()
  const peerEditor = peerRef.current.editor
  peerEditor.clearSelection()
  vueHost.querySelector('.sword-block-canvas')!.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'a',
    ctrlKey: true,
  }))
  await wait()
  check(vueInstance.selection.length === vueInstance.blocks.length && peerEditor.selection.length === 0, 'Same-page editors isolate block selection shortcuts')
  const savedOverflow = document.documentElement.style.overflow
  const openAt = (host: HTMLElement) => host.querySelector('[data-block-id]')!.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
  }))
  openAt(vueHost)
  await wait()
  openAt(peerHost)
  await wait()
  check(!vueHost.querySelector('.sword-context-menu') && !!peerHost.querySelector('.sword-context-menu') && document.documentElement.style.overflow === 'hidden', 'Cross-framework right click closes the previous menu while preserving the document scroll lock')
  peerRoot.unmount()
  await wait()
  check(document.documentElement.style.overflow === savedOverflow, 'React unmount releases an open menu scroll lock')
  openAt(vueHost)
  await wait()
  vue.unmount()
  check(document.documentElement.style.overflow === savedOverflow, 'Vue unmount releases an open menu scroll lock')
  check(vueInstance.state === 'destroyed', 'Vue unmount destroys its editor instance')
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const image = new ImageEditor({
    document: {
      format: 'site.image-document',
      version: 1,
      id: 'pixels',
      width: 4,
      height: 4,
      layers: [
        {
          id: 'red',
          type: 'solid',
          color: '#ff0000',
          x: 0,
          y: 0,
          width: 4,
          height: 4,
          rotation: 0,
          opacity: 1,
          visible: true,
          blend: 'source-over',
        },
        {
          id: 'blue',
          type: 'solid',
          color: '#0000ff',
          x: 2,
          y: 0,
          width: 2,
          height: 4,
          rotation: 0,
          opacity: 1,
          visible: true,
          blend: 'source-over',
        },
      ],
    },
  })
  const context = canvas.getContext('2d')!
  await image.execute('image.render', {
    context,
    resolveAsset: async () => {
      throw new Error('unexpected asset')
    },
  })
  check([
    ...context.getImageData(0, 0, 1, 1).data,
  ].join(',') === '255,0,0,255', 'Canvas2D renders lower layer pixels')
  check([
    ...context.getImageData(3, 0, 1, 1).data,
  ].join(',') === '0,0,255,255', 'Canvas2D respects layer order and geometry')
  image.execute('image.crop', { x: 2, y: 0, width: 2, height: 4 })
  const blob = await image.execute<Promise<Blob>>('image.export', {
    resolveAsset: async () => {
      throw new Error('unexpected asset')
    },
  })
  const bitmap = await createImageBitmap(blob)
  check(bitmap.width === 2 && bitmap.height === 4, 'PNG export uses crop dimensions')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  check([
    ...bytes.slice(0, 8),
  ].join(',') === '137,80,78,71,13,10,26,10', 'Export produces a valid PNG signature')
  const restored = importPsd(await exportPsd(image.document, async () => canvas, canvas))
  check(restored.document.layers.length === 2 && restored.assets.size === 2, 'PSD round trip retains two distinct raster layers')
  for (const framework of ['vue', 'react']) {
    const host = document.createElement('div')
    document.body.append(host)
    const app = framework === 'vue' ? createApp(VueImage) : createRoot(host)
    if ('mount' in app) app.mount(host)
    else app.render(<ReactImage />)
    await wait()
    const click = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!.click()
    const surface = host.querySelector('canvas')!
    host.style.width = '1440px'
    const measuredWidth = (selector: string) => host.querySelector(selector)!.getBoundingClientRect().width
    check(host.querySelector('.image-tools')!.getBoundingClientRect().height === 60
      && measuredWidth('.image-rail') === 72 && measuredWidth('.image-library') === 313
      && measuredWidth('.image-inspector') === 264, framework + ' matches reference desktop panel dimensions')
    const tool = host.querySelector('[data-tool="text"]')!
    check(getComputedStyle(tool, '::before').backgroundImage.includes('data:image/svg+xml'), framework + ' ships tool icons in package CSS')
    host.style.width = '375px'
    check(surface.closest('.image-stage')!.getBoundingClientRect().width === 375, framework + ' gives the mobile artboard the full component width')
    host.style.width = ''
    const size = host.querySelector<HTMLFormElement>('.image-size')!
    const disclosure = size.closest('details')!
    check(!disclosure.open, framework + ' initially shows the compact artboard inspector')
    disclosure.querySelector('summary')!.click()
    check(disclosure.open, framework + ' opens size controls on demand')
    const width = size.elements.namedItem('width') as HTMLInputElement
    width.value = '800'
    size.requestSubmit()
    check(surface.width === 800 && !disclosure.open, framework + ' applies dimensions and closes the size controls')
    const fitted = surface.style.width
    click('+')
    check(surface.style.width !== fitted && surface.width === 800, framework + ' zoom changes display size only')
    click('适应窗口')
    check(surface.style.width === fitted, framework + ' fits the artboard again')
    click('撤销')
    check(surface.width === 960, framework + ' undoes resize after viewport changes')
    click('标题模板')
    click('复制图层')
    check(host.querySelectorAll('.image-layers button').length === 2, framework + ' duplicates editable text layers')
    click('撤销')
    check(host.querySelectorAll('.image-layers button').length === 1, framework + ' restores the layer stack')
    app.unmount()
    host.remove()
  }
  bitmap.close()
  image.destroy()
  await checkDetached()
  document.body.dataset.status = 'passed'
  document.querySelector('#result')!.textContent = JSON.stringify({ passed: results.length, results }, null, 2)
}
run().catch((error) => {
  document.body.dataset.status = 'failed'
  document.querySelector('#result')!.textContent = JSON.stringify({
    error: String(error),
    stack: error?.stack,
    results,
  }, null, 2)
})
