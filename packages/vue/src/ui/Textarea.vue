<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

/**
 * 自封装多行输入（含 auto-size：按内容自适应高度，限制在 minRows/maxRows 之间）
 */
const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  minRows?: number
  maxRows?: number
  disabled?: boolean
}>(), {
  modelValue: '',
  placeholder: '',
  minRows: 2,
  maxRows: 6,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const el = ref<HTMLTextAreaElement>()

function resize() {
  const ta = el.value
  if (!ta)
    return
  const cs = getComputedStyle(ta)
  const lineHeight = Number.parseFloat(cs.lineHeight) || 20
  const padY = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom)
  const borderY = Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth)
  ta.style.height = 'auto'
  const content = ta.scrollHeight - padY - borderY
  const min = props.minRows * lineHeight
  const max = props.maxRows * lineHeight
  ta.style.height = `${Math.max(min, Math.min(content, max)) + padY + borderY}px`
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
  nextTick(resize)
}

onMounted(resize)
watch(() => props.modelValue, () => nextTick(resize))
</script>

<template>
  <textarea
    ref="el"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    rows="1"
    class="w-full resize-none rounded-md border border-(--line) bg-transparent px-3 py-2 text-[13px] leading-5 text-(--ink-1) outline-none transition-colors placeholder:text-(--ink-4) focus:border-(--accent)"
    @input="onInput"
  />
</template>
