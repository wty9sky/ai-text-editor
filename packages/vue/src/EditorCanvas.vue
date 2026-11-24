<script setup lang="ts">
/**
 * 画布：渲染块 + 每块「+」插入 + 鼠标框选多块 + 右键菜单
 * 高度范围：minHeight / maxHeight 约束，超长时内部滚动。
 */
import type { Block } from '@sword-editor/doc-editor'
import { computed, inject, onMounted, onUnmounted, reactive, ref } from 'vue'
import { createBlockSelection } from './block-selection.js'
import { EditorContextKey } from './context.js'
import ContextMenu from './ContextMenu.vue'
import { resolveIcon } from './icons.js'
import Dropdown from './ui/Dropdown.vue'
import DropdownItem from './ui/DropdownItem.vue'

withDefaults(defineProps<{
  minHeight?: string | number
  maxHeight?: string | number
}>(), {
  minHeight: undefined,
  maxHeight: undefined,
})
const ctx = inject(EditorContextKey)!
const editor = ctx.editor
const PlusIcon = resolveIcon('plus')
// 让模板在 editor.blocks / selection 变化时重渲染
const version = ref(0)
const offEditor = editor.on(() => {
  version.value += 1
})
onUnmounted(() => {
  offEditor()
  onUp()
})
const blocks = computed<Block[]>(() => {
  void version.value
  return [...editor.blocks]
})
// ── 框选多块 ─────────────────────────────────────────
const canvasRef = ref<HTMLElement>()
const rubber = reactive({
  active: false,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
})
const blockSelection = createBlockSelection(editor, () => canvasRef.value)
let offBackgroundSelection: (() => void) | undefined
onMounted(() => {
  offBackgroundSelection = blockSelection.mount()
})
onUnmounted(() => offBackgroundSelection?.())
const rubberStyle = computed(() => {
  const x = Math.min(rubber.x1, rubber.x2)
  const y = Math.min(rubber.y1, rubber.y2)
  const w = Math.abs(rubber.x2 - rubber.x1)
  const h = Math.abs(rubber.y2 - rubber.y1)
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  }
})
function intersects(rect: DOMRect): boolean {
  const rx = Math.min(rubber.x1, rubber.x2)
  const ry = Math.min(rubber.y1, rubber.y2)
  const rw = Math.abs(rubber.x2 - rubber.x1)
  const rh = Math.abs(rubber.y2 - rubber.y1)
  return !(rect.right < rx || rect.left > rx + rw || rect.bottom < ry || rect.top > ry + rh)
}
function onMove(e: MouseEvent) {
  if (!rubber.active)
    return
  rubber.x2 = e.clientX
  rubber.y2 = e.clientY
  const ids: string[] = []
  canvasRef.value?.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
    if (intersects(el.getBoundingClientRect()))
      ids.push(el.dataset.blockId!)
  })
  editor.select(ids)
}
function onUp() {
  rubber.active = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
}
function onCanvasMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('[data-block-id]') || target.closest('textarea,input,button,video,a,img,[contenteditable],select,[data-editor-interactive]'))
    return
  if (e.button !== 0)
    return
  blockSelection.activate()
  rubber.active = true
  rubber.x1 = rubber.x2 = e.clientX
  rubber.y1 = rubber.y2 = e.clientY
  editor.clearSelection()
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onBlockMouseDown(e: MouseEvent, id: string) {
  blockSelection.pointer(e, id)
}
// ── 右键菜单 ─────────────────────────────────────────
const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  index: -1,
})
function onBlockContextMenu(e: MouseEvent, index: number) {
  e.preventDefault()
  e.stopPropagation()
  const id = editor.blocks[index].id
  if (!editor.selection.includes(id))
    editor.select([id])
  openMenu(e, index)
}
function onCanvasContextMenu(e: MouseEvent) {
  if (editor.selection.length) {
    e.preventDefault()
    openMenu(e, editor.indexOf(editor.selection[0]))
  }
}
function openMenu(e: MouseEvent, index: number) {
  ctxMenu.index = Math.max(0, index)
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.visible = true
}
function closeMenu() {
  ctxMenu.visible = false
}
// ── 每块「+」插入 ────────────────────────────────────
const insertables = computed(() => {
  void version.value
  return editor.plugins.listInsertableBlocks()
})
function insertAfter(type: string, index: number) {
  ctx.insertBlock(type, index, true)
}
</script>

<template>
  <div
    ref="canvasRef"
    class="sword-block-canvas relative flex flex-col"
    tabindex="0"
    :style="{ minHeight: minHeight ? `${minHeight}px` : undefined, maxHeight: maxHeight ? `${maxHeight}px` : undefined }"
    :class="{ 'overflow-y-auto': !!maxHeight }"
    @keydown.capture="blockSelection.keydown"
    @mousedown="onCanvasMouseDown"
    @contextmenu="onCanvasContextMenu"
  >
    <div
      v-for="(block, index) in blocks"
      :key="block.id"
      :data-block-id="block.id"
      class="group relative flex items-start gap-1 rounded-md px-1 hover:bg-(--panel-2)"
      :class="{ 'bg-(--sel)': editor.selection.includes(block.id) }"
      @mousedown="onBlockMouseDown($event, block.id)"
      @contextmenu="onBlockContextMenu($event, index)"
    >
      <!-- 左侧「+」插入 -->
      <div class="sword-insert-trigger flex w-6 flex-none items-center pt-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Dropdown trigger="click" position="bl" @select="(v: any) => insertAfter(String(v), index)">
          <button type="button" class="flex size-5 items-center justify-center rounded text-(--ink-3) hover:bg-(--panel-1) hover:text-(--ink-1)" title="插入块">
            <component :is="PlusIcon" class="size-3.5" />
          </button>
          <template #content>
            <DropdownItem v-for="t in insertables" :key="t.type" :value="t.type">
              <span class="flex items-center gap-1.5">
                <component :is="resolveIcon(t.icon)" v-if="resolveIcon(t.icon)" class="size-3.5" />
                {{ t.label }}
              </span>
            </DropdownItem>
          </template>
        </Dropdown>
      </div>

      <!-- 块内容 -->
      <div class="min-w-0 flex-1 py-0.5">
        <component
          :is="ctx.blockRenderers[block.type] || editor.plugins.getRenderer('vue', block.type)?.component"
          v-if="ctx.blockRenderers[block.type] || editor.plugins.getRenderer('vue', block.type)"
          :editor="editor"
          :block="block"
          :index="index"
          :update="(patch: any) => editor.update(block.id, patch)"
          :remove="() => editor.remove([block.id])"
        />
        <div v-else class="whitespace-pre-wrap py-1 text-[14px]">
          {{ block.text }}
        </div>
      </div>

      <!-- 右侧选中标记 -->
      <div v-if="editor.selection.includes(block.id)" class="flex flex-none items-center pt-1">
        <span class="size-2 rounded-full bg-(--accent)" />
      </div>
    </div>

    <!-- 框选橡皮筋 -->
    <div
      v-if="rubber.active"
      class="sword-selection-marquee"
      :style="rubberStyle"
    />
  </div>

  <!-- 右键菜单 -->
  <Teleport to="body" disabled>
    <ContextMenu
      v-if="ctxMenu.visible"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :index="ctxMenu.index"
      @close="closeMenu"
    />
  </Teleport>
</template>
