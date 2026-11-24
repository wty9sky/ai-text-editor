interface ScrollLock {
  count: number
  rootOverflow: string
  bodyOverflow: string
  gutter: string
}
const key = Symbol.for('@sword-editor/menu-scroll-lock')
/** Shared per document even when framework packages bundle separate SDK copies. */
export function lockMenuScroll(menu: HTMLElement): () => void {
  const doc = menu.ownerDocument
  const stateHost = doc as Document & { [key: symbol]: ScrollLock | undefined }
  let state = stateHost[key]
  if (!state) {
    state = {
      count: 0,
      rootOverflow: doc.documentElement.style.overflow,
      bodyOverflow: doc.body.style.overflow,
      gutter: doc.documentElement.style.scrollbarGutter,
    }
    stateHost[key] = state
    doc.documentElement.style.scrollbarGutter = 'stable'
    doc.documentElement.style.overflow = 'hidden'
    doc.body.style.overflow = 'hidden'
  }
  state.count++
  function canScroll(target: EventTarget | null, delta: number): boolean {
    const element = target instanceof Element
      ? target.closest<HTMLElement>('.sword-menu-scroll')
      : null
    if (!element || !menu.contains(element))
      return false
    return delta < 0
      ? element.scrollTop > 0
      : delta > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1
  }
  function wheel(event: WheelEvent) {
    if (!event.ctrlKey && !canScroll(event.target, event.deltaY))
      event.preventDefault()
  }
  let touchY = 0
  function touchStart(event: TouchEvent) {
    touchY = event.touches[0]?.clientY ?? 0
  }
  function touchMove(event: TouchEvent) {
    const y = event.touches[0]?.clientY ?? touchY
    if (!canScroll(event.target, touchY - y))
      event.preventDefault()
    touchY = y
  }
  function keyboard(event: KeyboardEvent) {
    if ([
      'ArrowDown',
      'ArrowUp',
      'PageDown',
      'PageUp',
      'Home',
      'End',
      ' ',
    ].includes(event.key) && !(event.target instanceof Node && menu.contains(event.target))) {
      event.preventDefault()
    }
  }
  doc.addEventListener('wheel', wheel, { capture: true, passive: false })
  doc.addEventListener('touchstart', touchStart, { capture: true, passive: true })
  doc.addEventListener('touchmove', touchMove, { capture: true, passive: false })
  doc.addEventListener('keydown', keyboard, true)
  let released = false
  return () => {
    if (released)
      return
    released = true
    doc.removeEventListener('wheel', wheel, true)
    doc.removeEventListener('touchstart', touchStart, true)
    doc.removeEventListener('touchmove', touchMove, true)
    doc.removeEventListener('keydown', keyboard, true)
    if (--state!.count === 0) {
      doc.documentElement.style.overflow = state!.rootOverflow
      doc.body.style.overflow = state!.bodyOverflow
      doc.documentElement.style.scrollbarGutter = state!.gutter
      delete stateHost[key]
    }
  }
}
