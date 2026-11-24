<script setup lang="ts">
import { inject } from 'vue'

/**
 * 下拉菜单项（配合 Dropdown 使用，点击触发 @select 并关闭菜单）
 */
const props = withDefaults(defineProps<{
  value: string | number
  disabled?: boolean
}>(), {
  disabled: false,
})

const select = inject<(v: string | number) => void>('be-dropdown-select')

function onClick() {
  if (!props.disabled)
    select?.(props.value)
}
</script>

<template>
  <button
    type="button"
    class="sword-menu-item"
    :class="{ 'cursor-not-allowed opacity-40': disabled }"
    :disabled="disabled"
    @click="onClick"
  >
    <slot />
  </button>
</template>
