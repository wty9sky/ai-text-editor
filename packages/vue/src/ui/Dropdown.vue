<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, provide, ref } from 'vue'

/**
 * 自封装下拉菜单（点击触发 + Teleport 定位 + 点击外部关闭）
 * 用法：
 *   <Dropdown position="bl" @select="onSelect">
 *     <button>触发</button>
 *     <template #content><DropdownItem :value="x">…</DropdownItem></template>
 *   </Dropdown>
 */
const props = withDefaults(defineProps<{
  trigger?: 'click' | 'hover'
  position?: 'bl' | 'br'
}>(), {
  trigger: 'click',
  position: 'bl',
})

const emit = defineEmits<{
  (e: 'select', value: string | number): void
}>()

const open = ref(false)
const triggerRef = ref<HTMLElement>()
const menuRef = ref<HTMLElement>()
const menuStyle = ref<{ left: string, top: string }>({ left: '0', top: '0' })

provide('be-dropdown-select', (value: string | number) => {
  emit('select', value)
  open.value = false
})

function toggle() {
  open.value = !open.value
  if (open.value)
    nextTick(positionMenu)
}

function positionMenu() {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger || !menu)
    return
  const rect = trigger.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const below = rect.bottom + 4
  const top = Math.max(8, Math.min(below + menuRect.height > window.innerHeight - 8
    ? rect.top - menuRect.height - 4
    : below, window.innerHeight - menuRect.height - 8))
  const left = Math.max(8, Math.min(props.position === 'br'
    ? rect.right - menuRect.width
    : rect.left, window.innerWidth - menuRect.width - 8))
  menuStyle.value = { left: `${left}px`, top: `${top}px` }
}

function onDocMouseDown(e: MouseEvent) {
  if (!open.value)
    return
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || menuRef.value?.contains(t))
    return
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape')
    open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  window.addEventListener('resize', positionMenu)
  window.addEventListener('scroll', positionMenu, true)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  window.removeEventListener('resize', positionMenu)
  window.removeEventListener('scroll', positionMenu, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="triggerRef" class="inline-block" @click="toggle">
    <slot />
  </div>
  <Teleport to="body" disabled>
    <div
      v-if="open"
      ref="menuRef"
      class="sword-menu-panel sword-add-menu"
      data-editor-menu="dropdown"
      :style="menuStyle"
    >
      <div class="sword-menu-scroll">
        <slot name="content" />
      </div>
    </div>
  </Teleport>
</template>
