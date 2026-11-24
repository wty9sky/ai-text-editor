import type { Editor } from '@sword-editor/doc-editor'

/** Instance-local block selection; custom controls retain their native keyboard behavior. */
export function createBlockSelection(editor: Editor, root: () => HTMLElement | undefined | null) {
  let anchor: string | undefined
  let blockMode = false
  let lastAll = 0
  function focus() {
    root()?.focus({ preventScroll: true })
  }
  function activate() {
    blockMode = true
    lastAll = 0
    focus()
  }
  function mount() {
    const doc = root()?.ownerDocument
    function onBackgroundMouseDown(event: MouseEvent) {
      if (event.button !== 0 || editor.selection.length < 2)
        return
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-block-id],[data-editor-menu],button,a,input,textarea,select,label,video,[contenteditable],[data-editor-interactive]'))
        return
      anchor = undefined
      blockMode = false
      lastAll = 0
      editor.clearSelection()
    }
    doc?.addEventListener('mousedown', onBackgroundMouseDown, true)
    return () => doc?.removeEventListener('mousedown', onBackgroundMouseDown, true)
  }
  function pointer(event: MouseEvent, id: string) {
    if (event.button !== 0)
      return
    const target = event.target as HTMLElement
    if (target.closest('button,a,input,textarea,select,video,[data-editor-interactive]'))
      return
    lastAll = 0
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault()
      if (event.shiftKey) {
        const start = anchor && editor.getBlock(anchor)
          ? anchor
          : editor.selection[0] ?? id
        editor.selectRange(start, id, event.ctrlKey || event.metaKey)
      }
      else {
        editor.toggleSelect(id)
        anchor = id
      }
      blockMode = true
      focus()
      return
    }
    anchor = id
    blockMode = false
    if (target.closest('[contenteditable]'))
      return
    event.preventDefault()
    editor.select([id])
    blockMode = true
    focus()
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing || event.defaultPrevented)
      return
    const target = event.target as HTMLElement
    if (target.closest('.sword-block-canvas') !== root())
      return
    if (target.closest('input,textarea,select,button,[data-editor-interactive]'))
      return
    const editable = target.closest('[contenteditable]')
    if (editable && !editable.hasAttribute('data-block-index'))
      return
    const modifier = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (modifier && key === 'a' && !event.altKey) {
      if (event.repeat)
        return
      const now = Date.now()
      if (!editable || blockMode || (lastAll > 0 && now - lastAll <= 700)) {
        event.preventDefault()
        editor.select(editor.blocks.map(block => block.id))
        blockMode = true
        lastAll = 0
        focus()
        target.ownerDocument.getSelection()?.removeAllRanges()
      }
      else {
        lastAll = now
      }
      return
    }
    if (!['control', 'meta', 'shift'].includes(key))
      lastAll = 0
    if (!blockMode)
      return
    if (key === 'escape') {
      editor.clearSelection()
      blockMode = false
      return
    }
    let command: string | undefined
    let payload: unknown
    if ((key === 'backspace' || key === 'delete') && editor.selection.length) {
      command = 'core.delete'
      payload = [...editor.selection]
    }
    else if (modifier && key === 'z') {
      command = event.shiftKey ? 'core.redo' : 'core.undo'
    }
    else if (modifier && key === 'y') {
      command = 'core.redo'
    }
    if (!command)
      return
    event.preventDefault()
    try {
      editor.execute(command, payload)
    }
    catch (error) {
      editor.reportError(error)
    }
    focus()
  }
  return { pointer, keydown, activate, mount }
}
