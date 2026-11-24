<script setup lang="ts">
/**
 * 右键菜单：单块 + 多选批量
 * - 菜单项 = 插件注册的右键项 + 内置「转为 X」 + AI（注入时）
 * - 屏幕自适应：超长可滚动，贴边自动翻转
 * - 点击外部 / Esc 关闭；菜单打开期间锁定背景滚动
 */
import type { Block, EditorActionContext } from '@sword-editor/doc-editor'
import { computed, inject, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { EditorContextKey } from './context.js'
import { resolveIcon } from './icons.js'
import { lockMenuScroll } from './menu-scroll.js'

const props = defineProps<{
  x: number
  y: number
  index: number
}>()
const emit = defineEmits<{
  (e: 'close'): void
}>()
const ctx = inject(EditorContextKey)!
const editor = ctx.editor
const version = ref(0)
onUnmounted(editor.on(() => {
  version.value++
}))
interface MenuItem {
  id: string
  label: string
  icon?: string
  group: string
  danger?: boolean
  action: () => void
}
const block = computed<Block | undefined>(() => {
  void version.value
  return editor.blocks[props.index]
})
function actionCtx(): EditorActionContext {
  return {
    editor,
    block: editor.blocks[props.index],
    index: props.index,
    selection: [...editor.selection],
    selectedBlocks: editor.selectedBlocks,
  }
}
const items = computed<MenuItem[]>(() => {
  void version.value
  const c = actionCtx()
  if (!c.block)
    return []
  const list: MenuItem[] = []
  // AI 操作：全部由插件注册，组件层不硬编码
  for (const action of editor.plugins.listAiActions()) {
    list.push({
      id: `ai:${action.id}`,
      label: action.label,
      icon: action.icon ?? 'sparkles',
      group: 'ai',
      action: () => ctx.openAi(action.id, props.index),
    })
  }
  // 转为 X
  for (const def of editor.plugins.listInsertableBlocks()) {
    if (def.type === c.block.type)
      continue
    list.push({
      id: `to-${def.type}`,
      label: `转为${def.label}`,
      icon: def.icon,
      group: 'transform',
      action: () => editor.convert(c.block.id, def.type),
    })
  }
  // 插件注册的右键项
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
})
function run(item: MenuItem) {
  item.action()
  emit('close')
}
// ── 屏幕自适应 + 点击外部关闭 ─────────────────────────
const menuRef = ref<HTMLElement>()
const pos = reactive({ left: props.x, top: props.y })
let raf1 = 0
let raf2 = 0
let motionRaf = 0
let unlockScroll = () => {}
function adjustPosition() {
  cancelAnimationFrame(raf1)
  cancelAnimationFrame(raf2)
  // 双 RAF：等浏览器完成 layout + paint 后再测量，
  // 避免首次渲染时 Tailwind 类 / 图标未稳定导致测到异常尺寸、把菜单误推到屏幕边缘
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      const el = menuRef.value
      if (!el)
        return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      // 尺寸尚未稳定（0 或异常大）时保持鼠标原位，等下一次触发再校正
      if (rect.width <= 0 || rect.height <= 0 || rect.width > vw || rect.height > vh)
        return
      let left = props.x
      let top = props.y
      // 底边超出：向上翻；右边超出：向左翻
      if (top + rect.height > vh - 8)
        top = Math.max(8, vh - rect.height - 8)
      if (left + rect.width > vw - 8)
        left = Math.max(8, vw - rect.width - 8)
      pos.left = left
      pos.top = top
      if (!el.hasAttribute('data-positioned')) {
        motionRaf = requestAnimationFrame(() => {
          el.dataset.positioned = ''
        })
      }
    })
  })
}
function onGlobalMousedown(e: MouseEvent) {
  // 仅左键关闭；右键交给 contextmenu 重新定位（避免「先关再开」闪烁）
  if (e.button !== 0)
    return
  if (menuRef.value && !menuRef.value.contains(e.target as Node))
    emit('close')
}
function onContextmenu(e: MouseEvent) {
  if (!(e.target instanceof Element) || e.target.closest('.sword-editor') !== menuRef.value?.closest('.sword-editor'))
    emit('close')
}
watch(() => [props.x, props.y, props.index], () => {
  const scroll = menuRef.value?.querySelector('.sword-menu-scroll')
  if (scroll)
    scroll.scrollTop = 0
  adjustPosition()
}, { flush: 'post' })
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape')
    emit('close')
}
onMounted(() => {
  unlockScroll = lockMenuScroll(menuRef.value!)
  adjustPosition()
  document.addEventListener('contextmenu', onContextmenu, true)
  document.addEventListener('mousedown', onGlobalMousedown, true)
  window.addEventListener('resize', adjustPosition)
  window.addEventListener('scroll', adjustPosition, true)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  unlockScroll()
  cancelAnimationFrame(motionRaf)
  cancelAnimationFrame(raf1)
  cancelAnimationFrame(raf2)
  document.removeEventListener('contextmenu', onContextmenu, true)
  document.removeEventListener('mousedown', onGlobalMousedown, true)
  window.removeEventListener('resize', adjustPosition)
  window.removeEventListener('scroll', adjustPosition, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="menuRef"
    class="sword-menu-panel sword-context-menu"
    data-editor-menu
    :data-target-block-id="block?.id"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @click.stop
    @contextmenu.stop
  >
    <template v-if="block">
      <div class="sword-menu-header">
        <span class="sword-menu-caption">
          {{ editor.selection.length > 1 ? `已选 ${editor.selection.length} 个块` : '块操作' }}
        </span>
      </div>
    </template>
    <div class="sword-menu-scroll">
      <template v-for="(item, i) in items" :key="item.id">
        <div v-if="i > 0 && items[i - 1].group !== item.group" class="sword-menu-divider" />
        <button
          type="button"
          class="sword-menu-item"
          :class="{ 'is-ai': item.group === 'ai', 'is-danger': item.danger }"
          @click="run(item)"
        >
          <component :is="resolveIcon(item.icon)" v-if="resolveIcon(item.icon)" class="size-3.5" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </div>
  </div>
</template>
