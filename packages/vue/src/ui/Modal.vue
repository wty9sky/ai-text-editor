<script setup lang="ts">
/**
 * 自封装对话框（遮罩 + Teleport 到 body + 标题/内容/footer 插槽）
 */
const props = withDefaults(defineProps<{
  visible?: boolean
  width?: number | string
  footer?: boolean
  title?: string
  maskClosable?: boolean
}>(), {
  visible: false,
  width: 520,
  footer: true,
  title: '',
  maskClosable: true,
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'cancel'): void
  (e: 'ok'): void
}>()

function close() {
  emit('update:visible', false)
  emit('cancel')
}

function onMaskClick() {
  if (props.maskClosable)
    close()
}
</script>

<template>
  <Teleport to="body" disabled>
    <div v-if="visible" class="fixed inset-0 z-1000 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="onMaskClick" />
      <div
        class="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-(--panel-3) bg-(--bg) shadow-xl"
        :style="{ maxWidth: typeof width === 'number' ? `${width}px` : width }"
      >
        <div class="flex items-center justify-between border-b border-(--line) px-4 py-3">
          <div class="text-[15px] font-semibold text-(--ink-1)">
            <slot name="title">{{ title }}</slot>
          </div>
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded text-(--ink-3) transition-colors hover:bg-(--panel-2) hover:text-(--ink-1)"
            @click="close"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-4 py-3">
          <slot />
        </div>
        <div v-if="footer" class="flex justify-end gap-2 border-t border-(--line) px-4 py-3">
          <slot name="footer">
            <button
              type="button"
              class="inline-flex h-8 items-center justify-center rounded border border-(--line) px-3 text-[13px] font-medium text-(--ink-2) transition-colors hover:border-(--accent-line) hover:text-(--accent)"
              @click="close"
            >
              取消
            </button>
            <button
              type="button"
              class="inline-flex h-8 items-center justify-center rounded bg-(--accent) px-3 text-[13px] font-medium text-white transition-colors hover:bg-(--accent-hover)"
              @click="$emit('ok')"
            >
              确定
            </button>
          </slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>
