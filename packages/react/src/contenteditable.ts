/** DOM adapter only: never persist HTML or execute pasted markup. */
export function editableText(el: HTMLElement): string {
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText preserves browser-generated line breaks.
  return el.innerText.replace(/\r\n/g, '\n')
}
export function offsets(el: HTMLElement): { from: number, to: number } {
  const selection = el.ownerDocument.getSelection()
  if (!selection?.rangeCount || !el.contains(selection.anchorNode) || !el.contains(selection.focusNode))
    return { from: el.textContent?.length ?? 0, to: el.textContent?.length ?? 0 }
  const range = selection.getRangeAt(0)
  const start = range.cloneRange()
  start.selectNodeContents(el)
  start.setEnd(range.startContainer, range.startOffset)
  const end = range.cloneRange()
  end.selectNodeContents(el)
  end.setEnd(range.endContainer, range.endOffset)
  return { from: start.toString().length, to: end.toString().length }
}
export function caret(el: HTMLElement, from: number, to = from): void {
  const node = el.firstChild
  const range = el.ownerDocument.createRange()
  if (node?.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(from, node.textContent?.length ?? 0))
    range.setEnd(node, Math.min(to, node.textContent?.length ?? 0))
  }
  else {
    range.selectNodeContents(el)
    range.collapse(false)
  }
  const selection = el.ownerDocument.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
export function syncEditable(el: HTMLElement, text: string): void {
  if (el.textContent === text)
    return
  const focused = el.ownerDocument.activeElement === el
  const selection = focused
    ? offsets(el)
    : undefined
  el.textContent = text
  if (selection)
    caret(el, selection.from, selection.to)
}
export function insertPlainText(el: HTMLElement, text: string): void {
  const { from, to } = offsets(el)
  const before = el.textContent ?? ''
  el.textContent = before.slice(0, from) + text + before.slice(to)
  caret(el, from + text.length)
}
