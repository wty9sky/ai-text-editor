<script setup lang="ts">
import { computed } from 'vue'

/**
 * 自封装按钮（对齐 shadcn/ui 视觉，仅依赖 Tailwind + CSS 变量，无第三方组件库）
 */
const props = withDefaults(defineProps<{
  type?: 'primary' | 'default'
  status?: 'normal' | 'danger'
  size?: 'mini' | 'default'
  loading?: boolean
  disabled?: boolean
}>(), {
  type: 'default',
  status: 'normal',
  size: 'default',
  loading: false,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void
}>()

function onClick(ev: MouseEvent) {
  if (props.loading || props.disabled)
    return
  emit('click', ev)
}

const cls = computed(() => {
  const parts = [
    'inline-flex items-center justify-center gap-1 rounded font-medium transition-colors select-none',
    props.size === 'mini' ? 'h-6 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
  ]
  if (props.type === 'primary') {
    parts.push(props.status === 'danger'
      ? 'bg-(--down) text-white hover:opacity-90'
      : 'bg-(--accent) text-white hover:bg-(--accent-hover)')
  }
  else {
    parts.push(props.status === 'danger'
      ? 'border border-(--down) text-(--down) hover:opacity-80'
      : 'border border-(--line) text-(--ink-2) hover:border-(--accent-line) hover:text-(--accent)')
  }
  if (props.loading || props.disabled)
    parts.push('cursor-not-allowed opacity-60')
  return parts.join(' ')
})
</script>

<template>
  <button type="button" :class="cls" :disabled="loading || disabled" @click="onClick">
    <span v-if="loading" class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <slot />
  </button>
</template>
