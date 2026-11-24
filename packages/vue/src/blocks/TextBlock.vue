<script setup lang="ts">
import type { Block } from '@sword-editor/doc-editor'
import { getTextStyle } from '@sword-editor/doc-editor'
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { editableText, insertPlainText, offsets, syncEditable } from '../contenteditable.js'
import { EditorContextKey, EditorKey } from '../context.js'

const props = defineProps<{ block: Block, index: number }>()
const editor = inject(EditorKey)!
const ctx = inject(EditorContextKey)!
const element = ref<HTMLElement>()
let composing = false
const style = computed(() => {
  const value = getTextStyle(props.block)
  return {
    fontSize: value.fontSize
      ? `${value.fontSize}px`
      : undefined,
    fontWeight: value.bold === undefined
      ? undefined
      : value.bold ? '700' : '400',
    fontStyle: value.italic === undefined
      ? undefined
      : value.italic ? 'italic' : 'normal',
    textDecoration: value.underline ? 'underline' : undefined,
    textAlign: value.align,
  }
})
const numberLabel = computed(() => {
  let start = props.index
  while (start > 0 && editor.blocks[start - 1].type === 'number') start--
  return `${props.index - start + 1}.`
})
function sync() {
  if (element.value && !composing)
    syncEditable(element.value, props.block.text)
}
onMounted(sync)
watch(() => props.block.text, sync, { flush: 'post' })
function commit() {
  const el = element.value!
  if (composing)
    return
  try {
    focus()
    editor.update(props.block.id, {
      text: editableText(el),
    })
  }
  catch (error) {
    syncEditable(el, editor.getBlock(props.block.id)?.text ?? '')
    editor.reportError(error)
  }
}
function focus() {
  if (!editor.selection.includes(props.block.id))
    editor.select([props.block.id])
}
function newline() {
  insertPlainText(element.value!, '\n')
  commit()
}
function onBeforeInput(e: InputEvent) {
  if (composing || e.isComposing)
    return
  if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
    e.preventDefault()
    editor.execute(e.inputType === 'historyUndo'
      ? 'core.undo'
      : 'core.redo')
  }
  else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
    e.preventDefault()
    if (props.block.type === 'code' || e.inputType === 'insertLineBreak')
      newline()
    else split()
  }
}
function split() {
  const range = offsets(element.value!)
  const nextId = editor.execute('core.split', { id: props.block.id, ...range }) as string
  nextTick(() => ctx.focusBlock(editor.indexOf(nextId)))
}
function onKeydown(e: KeyboardEvent) {
  if (composing || e.isComposing)
    return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    editor.execute(e.shiftKey ? 'core.redo' : 'core.undo')
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    if (props.block.type === 'code' || e.shiftKey)
      newline()
    else split()
  }
  else if (e.key === 'Backspace' && !props.block.text && props.block.type !== 'code' && editor.blocks.length > 1) {
    e.preventDefault()
    editor.execute('core.delete', [props.block.id])
    nextTick(() => ctx.focusBlock(Math.max(0, props.index - 1)))
  }
}
function paste(e: ClipboardEvent) {
  e.preventDefault()
  insertPlainText(element.value!, e.clipboardData?.getData('text/plain') ?? '')
  commit()
}
function compositionEnd() {
  composing = false
  commit()
}
</script>

<template>
  <div class="sword-text-row" :class="[`sword-text-${block.type}`]">
    <span v-if="block.type === 'bullet' || block.type === 'number'" class="sword-list-marker" aria-hidden="true">{{ block.type === 'bullet' ? '•' : numberLabel }}</span>
    <div
      ref="element"
      contenteditable="plaintext-only"
      role="textbox"
      aria-multiline="true"
      :aria-label="block.type === 'code' ? '代码块' : '文本块'"
      :data-block-index="index"
      :data-placeholder="block.type.startsWith('h') ? `标题 ${block.type.slice(1)}` : ctx.placeholder"
      class="sword-text-editable"
      :style="style"
      @input="commit"
      @beforeinput="onBeforeInput"
      @keydown="onKeydown"
      @paste="paste"
      @drop.prevent
      @focus="focus"
      @compositionstart="composing = true"
      @compositionend="compositionEnd"
    />
  </div>
</template>
