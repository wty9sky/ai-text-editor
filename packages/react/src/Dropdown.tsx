import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export function Dropdown({ trigger, children }: { trigger: React.ReactNode, children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!open)
      return
    function position() {
      const anchor = ref.current!.getBoundingClientRect()
      const menu = menuRef.current!.getBoundingClientRect()
      const below = anchor.bottom + 4
      setPos({
        left: Math.max(8, Math.min(anchor.left, innerWidth - menu.width - 8)),
        top: Math.max(8, Math.min(below + menu.height > innerHeight - 8
          ? anchor.top - menu.height - 4
          : below, innerHeight - menu.height - 8)),
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])
  useEffect(() => {
    if (!open)
      return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false)
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape')
        setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKeydown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKeydown)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(v => !v)}>{trigger}</div>
      {open && (
        <div ref={menuRef} className="sword-menu-panel sword-add-menu" data-editor-menu="dropdown" style={pos}>
          <div className="sword-menu-scroll">{children(() => setOpen(false))}</div>
        </div>
      )}
    </div>
  )
}
