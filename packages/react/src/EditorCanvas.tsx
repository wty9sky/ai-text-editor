import type { Block } from '@sword-editor/doc-editor'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createBlockSelection } from './block-selection.js'
import { useDocEditor } from './context.js'
import { ContextMenu } from './ContextMenu.js'
import { Dropdown } from './Dropdown.js'
import { resolveIcon } from './icons.js'

interface CtxMenuState {
  visible: boolean
  x: number
  y: number
  index: number
}
export function EditorCanvas({ minHeight, maxHeight }: {
  minHeight?: number
  maxHeight?: number
}) {
  const { editor, blockRenderers, insertBlock } = useDocEditor()
  const canvasRef = useRef<HTMLDivElement>(null)
  const blockSelection = useMemo(() => createBlockSelection(editor, () => canvasRef.current), [editor])
  useEffect(() => blockSelection.mount(), [blockSelection])
  const dragCleanup = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => dragCleanup.current?.(), [])
  const [rubber, setRubber] = useState({
    active: false,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  })
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState>({
    visible: false,
    x: 0,
    y: 0,
    index: -1,
  })
  const blocks = [...editor.blocks]
  const insertables = editor.plugins.listInsertableBlocks()
  function intersects(rect: DOMRect, x1: number, y1: number, x2: number, y2: number): boolean {
    const rx = Math.min(x1, x2)
    const ry = Math.min(y1, y2)
    const rw = Math.abs(x2 - x1)
    const rh = Math.abs(y2 - y1)
    return !(rect.right < rx || rect.left > rx + rw || rect.bottom < ry || rect.top > ry + rh)
  }
  function onCanvasMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-block-id]') || target.closest('textarea,input,button,video,a,img,[contenteditable],select,[data-editor-interactive]'))
      return
    if (e.button !== 0)
      return
    blockSelection.activate()
    const startX = e.clientX
    const startY = e.clientY
    setRubber({
      active: true,
      x1: startX,
      y1: startY,
      x2: startX,
      y2: startY,
    })
    editor.clearSelection()
    const onMove = (ev: MouseEvent) => {
      setRubber(r => ({ ...r, x2: ev.clientX, y2: ev.clientY }))
      const ids: string[] = []
      canvasRef.current?.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
        if (intersects(el.getBoundingClientRect(), startX, startY, ev.clientX, ev.clientY))
          ids.push(el.dataset.blockId!)
      })
      editor.select(ids)
    }
    const onUp = () => {
      setRubber(r => ({ ...r, active: false }))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    dragCleanup.current?.()
    dragCleanup.current = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  function onBlockMouseDown(e: React.MouseEvent, id: string) {
    blockSelection.pointer(e.nativeEvent, id)
  }
  function onBlockContextMenu(e: React.MouseEvent, index: number) {
    e.preventDefault()
    e.stopPropagation()
    const id = editor.blocks[index].id
    if (!editor.selection.includes(id))
      editor.select([id])
    setCtxMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      index,
    })
  }
  function renderBlock(block: Block, index: number) {
    const Renderer = blockRenderers[block.type] ?? editor.plugins.getRenderer('react', block.type)?.component as React.ComponentType<import('./types.js').BlockRendererProps> | undefined
    if (Renderer) {
      return (<Renderer editor={editor} block={block} index={index} update={patch => editor.update(block.id, patch)} remove={() => editor.remove([block.id])} />)
    }
    return <div className="whitespace-pre-wrap py-1 text-[14px]">{block.text}</div>
  }
  const rubberStyle = {
    left: Math.min(rubber.x1, rubber.x2),
    top: Math.min(rubber.y1, rubber.y2),
    width: Math.abs(rubber.x2 - rubber.x1),
    height: Math.abs(rubber.y2 - rubber.y1),
  }
  return (
    <>
      <div
        ref={canvasRef}
        tabIndex={0}
        onKeyDownCapture={e => blockSelection.keydown(e.nativeEvent)}
        className={`sword-block-canvas relative flex flex-col ${maxHeight ? 'overflow-y-auto' : ''}`}
        style={{ minHeight, maxHeight }}
        onMouseDown={onCanvasMouseDown}
        onContextMenu={(event) => {
          if (editor.selection.length)
            onBlockContextMenu(event, editor.indexOf(editor.selection[0]))
        }}
      >
        {blocks.map((block, index) => (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`group relative flex items-start gap-1 rounded-md px-1 hover:bg-(--panel-2) ${editor.selection.includes(block.id)
              ? 'bg-(--sel)'
              : ''}`}
            onMouseDown={e => onBlockMouseDown(e, block.id)}
            onContextMenu={e => onBlockContextMenu(e, index)}
          >
            <div className="sword-insert-trigger flex w-6 flex-none items-center pt-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Dropdown trigger={(
                <button type="button" title="插入块" className="flex size-5 items-center justify-center rounded text-(--ink-3) hover:bg-(--panel-1) hover:text-(--ink-1)">
                  <Plus className="size-3.5" />
                </button>
              )}
              >
                {close => insertables.map(t => (
                  <button
                    key={t.type}
                    type="button"
                    className="sword-menu-item"
                    onClick={() => {
                      insertBlock(t.type, index, true)
                      close()
                    }}
                  >
                    {(() => {
                      const Icon = resolveIcon(t.icon)
                      return Icon
                        ? <Icon className="size-3.5" />
                        : null
                    })()}
                    {t.label}
                  </button>
                ))}
              </Dropdown>
            </div>

            <div className="min-w-0 flex-1 py-0.5">
              {renderBlock(block, index)}
            </div>

            {editor.selection.includes(block.id) && (
              <div className="flex flex-none items-center pt-1">
                <span className="size-2 rounded-full bg-(--accent)" />
              </div>
            )}
          </div>
        ))}

        {rubber.active && (<div className="sword-selection-marquee" style={rubberStyle} />)}
      </div>

      {ctxMenu.visible && (<ContextMenu x={ctxMenu.x} y={ctxMenu.y} index={ctxMenu.index} onClose={() => setCtxMenu(s => ({ ...s, visible: false }))} />)}
    </>
  )
}
