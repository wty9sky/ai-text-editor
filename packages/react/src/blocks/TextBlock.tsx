import type { Block } from '@sword-editor/doc-editor'
import { getTextStyle } from '@sword-editor/doc-editor'
import { useLayoutEffect, useRef } from 'react'
import { editableText, insertPlainText, offsets, syncEditable } from '../contenteditable.js'
import { useDocEditor } from '../context.js'

export function TextBlock({ block, index }: { block: Block, index: number }) {
  const { editor, placeholder, focusBlock } = useDocEditor()
  const element = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  useLayoutEffect(() => {
    if (element.current && !composing.current)
      syncEditable(element.current, block.text)
  }, [block.text])
  function commit() {
    if (composing.current)
      return
    const el = element.current!
    try {
      if (!editor.selection.includes(block.id))
        editor.select([block.id])
      editor.update(block.id, {
        text: editableText(el),
      })
    }
    catch (error) {
      syncEditable(el, editor.getBlock(block.id)?.text ?? '')
      editor.reportError(error)
    }
  }
  function newline() {
    insertPlainText(element.current!, '\n')
    commit()
  }
  function split() {
    const range = offsets(element.current!)
    const nextId = editor.execute('core.split', { id: block.id, ...range }) as string
    requestAnimationFrame(() => focusBlock(editor.indexOf(nextId)))
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (composing.current || e.nativeEvent.isComposing)
      return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      editor.execute(e.shiftKey ? 'core.redo' : 'core.undo')
    }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (block.type === 'code' || e.shiftKey)
        newline()
      else split()
    }
    else if (e.key === 'Backspace' && !block.text && block.type !== 'code' && editor.blocks.length > 1) {
      e.preventDefault()
      editor.execute('core.delete', [block.id])
      requestAnimationFrame(() => focusBlock(Math.max(0, index - 1)))
    }
  }
  // Native beforeinput covers mobile keyboards and browser history actions.
  useLayoutEffect(() => {
    const el = element.current!
    const beforeInput = (e: InputEvent) => {
      if (composing.current || e.isComposing)
        return
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
        e.preventDefault()
        editor.execute(e.inputType === 'historyUndo'
          ? 'core.undo'
          : 'core.redo')
      }
      else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        e.preventDefault()
        if (block.type === 'code' || e.inputType === 'insertLineBreak')
          newline()
        else split()
      }
    }
    el.addEventListener('beforeinput', beforeInput)
    return () => el.removeEventListener('beforeinput', beforeInput)
  })
  let start = index
  while (start > 0 && editor.blocks[start - 1].type === 'number') start--
  const style = getTextStyle(block)
  return (
    <div className={`sword-text-row sword-text-${block.type}`}>
      {(block.type === 'bullet' || block.type === 'number') && (
        <span className="sword-list-marker" aria-hidden="true">
          {block.type === 'bullet'
            ? '•'
            : `${index - start + 1}.`}
        </span>
      )}
      <div
        ref={element}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={block.type === 'code'
          ? '代码块'
          : '文本块'}
        data-block-index={index}
        data-placeholder={block.type.startsWith('h')
          ? `标题 ${block.type.slice(1)}`
          : placeholder}
        className="sword-text-editable"
        style={{
          fontSize: style.fontSize,
          fontWeight: style.bold === undefined
            ? undefined
            : style.bold ? 700 : 400,
          fontStyle: style.italic === undefined
            ? undefined
            : style.italic ? 'italic' : 'normal',
          textDecoration: style.underline ? 'underline' : undefined,
          textAlign: style.align,
        }}
        onInput={commit}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          e.preventDefault()
          insertPlainText(element.current!, e.clipboardData.getData('text/plain'))
          commit()
        }}
        onDrop={e => e.preventDefault()}
        onFocus={() => {
          if (!editor.selection.includes(block.id))
            editor.select([block.id])
        }}
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={() => {
          composing.current = false
          commit()
        }}
      />
    </div>
  )
}
