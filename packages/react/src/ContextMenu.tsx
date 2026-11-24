import type { EditorActionContext } from '@sword-editor/doc-editor'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDocEditor } from './context.js'
import { resolveIcon } from './icons.js'
import { lockMenuScroll } from './menu-scroll.js'

interface MenuItem {
  id: string
  label: string
  icon?: string
  group: string
  danger?: boolean
  action: () => void
}

export function ContextMenu({ x, y, index, onClose }: { x: number, y: number, index: number, onClose: () => void }) {
  const { editor, openAi } = useDocEditor()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  const block = editor.blocks[index]

  function actionCtx(): EditorActionContext {
    return {
      editor,
      block,
      index,
      selection: [...editor.selection],
      selectedBlocks: editor.selectedBlocks,
    }
  }

  const items: MenuItem[] = (() => {
    const c = actionCtx()
    const list: MenuItem[] = []
    if (!block)
      return list

    // AI 操作：全部由插件注册，组件层不硬编码
    for (const action of editor.plugins.listAiActions()) {
      list.push({
        id: `ai:${action.id}`,
        label: action.label,
        icon: action.icon ?? 'sparkles',
        group: 'ai',
        action: () => openAi(action.id, index),
      })
    }

    for (const def of editor.plugins.listInsertableBlocks()) {
      if (def.type === block.type)
        continue
      list.push({
        id: `to-${def.type}`,
        label: `转为${def.label}`,
        icon: def.icon,
        group: 'transform',
        action: () => editor.convert(block.id, def.type),
      })
    }

    for (const item of editor.plugins.contextMenu) {
      if (item.when && !item.when(c))
        continue
      list.push({
        id: item.id,
        label: item.label,
        icon: item.icon,
        group: item.group ?? 'operation',
        danger: item.danger,
        action: () => item.action(c),
      })
    }

    return list
  })()

  useEffect(() => lockMenuScroll(menuRef.current!), [])

  useEffect(() => {
    if (!block)
      onClose()
  }, [block, onClose])

  // 屏幕自适应（双 RAF 等布局稳定）
  useLayoutEffect(() => {
    const scroll = menuRef.current?.querySelector('.sword-menu-scroll')
    if (scroll)
      scroll.scrollTop = 0
    let raf1 = 0
    let raf2 = 0
    let motionRaf = 0
    const adjust = () => {
      const el = menuRef.current
      if (!el)
        return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (rect.width <= 0 || rect.height <= 0 || rect.width > vw || rect.height > vh)
        return
      let left = x
      let top = y
      if (top + rect.height > vh - 8)
        top = Math.max(8, vh - rect.height - 8)
      if (left + rect.width > vw - 8)
        left = Math.max(8, vw - rect.width - 8)
      setPos({ left, top })
      if (!el.hasAttribute('data-positioned')) {
        motionRaf = requestAnimationFrame(() => {
          el.dataset.positioned = ''
        })
      }
    }
    window.addEventListener('resize', adjust)
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(adjust)
    })
    return () => {
      window.removeEventListener('resize', adjust)
      cancelAnimationFrame(motionRaf)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [x, y, index])

  // 点击外部 / Esc 关闭
  useEffect(() => {
    function onMousedown(e: MouseEvent) {
      if (e.button !== 0)
        return
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose()
    }
    function onContextmenu(e: MouseEvent) {
      if (!(e.target instanceof Element) || e.target.closest('.sword-editor') !== menuRef.current?.closest('.sword-editor'))
        onClose()
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape')
        onClose()
    }
    document.addEventListener('contextmenu', onContextmenu, true)
    document.addEventListener('mousedown', onMousedown, true)
    window.addEventListener('keydown', onKeydown)
    return () => {
      document.removeEventListener('contextmenu', onContextmenu, true)
      document.removeEventListener('mousedown', onMousedown, true)
      window.removeEventListener('keydown', onKeydown)
    }
  }, [onClose])

  function run(item: MenuItem) {
    item.action()
    onClose()
  }

  const menu = (
    <div
      ref={menuRef}
      className="sword-menu-panel sword-context-menu"
      data-editor-menu
      data-target-block-id={block?.id}
      style={{ left: pos.left, top: pos.top }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
    >
      <div className="sword-menu-header">
        {editor.selection.length > 1
          ? `已选 ${editor.selection.length} 个块`
          : '块操作'}
      </div>
      <div className="sword-menu-scroll">
        {items.map((item, i) => {
          const Icon = resolveIcon(item.icon)
          return (
            <div key={item.id}>
              {i > 0 && items[i - 1].group !== item.group && <div className="sword-menu-divider" />}
              <button
                type="button"
                className={`sword-menu-item ${item.group === 'ai'
                  ? 'is-ai'
                  : ''} ${item.danger ? 'is-danger' : ''}`}
                onClick={() => run(item)}
              >
                {Icon && <Icon className="size-3.5" />}
                <span>{item.label}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )

  return menu
}
