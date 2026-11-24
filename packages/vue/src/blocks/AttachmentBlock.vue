<script setup lang="ts">
import type { Block } from '@sword-editor/doc-editor'
import { computed, inject } from 'vue'
import { EditorContextKey } from '../context.js'
import { resolveIcon } from '../icons.js'
import Button from '../ui/Button.vue'

const props = defineProps<{ block: Block, index: number }>()
const ctx = inject(EditorContextKey)!

const uploader = computed(() => ctx.uploaders.find(u => u.kind === 'attachment'))
const FileIcon = resolveIcon('file')

/** 展示名：优先 props.name，否则取 url 最后一段 */
const name = computed(() => {
  if (props.block.props?.name)
    return props.block.props.name as string
  const seg = props.block.text.split('/').filter(Boolean)
  return seg[seg.length - 1] || '附件'
})

function remove() {
  ctx.editor.remove([props.block.id])
}
</script>

<template>
  <div class="py-1">
    <div v-if="block.text" class="inline-flex max-w-full items-center gap-2 rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2">
      <component :is="FileIcon" class="size-4 flex-none text-(--ink-3)" />
      <a
        :href="ctx.resolveUrl(block.text)"
        target="_blank"
        rel="noopener noreferrer"
        class="max-w-xs truncate text-[13px] text-(--accent-ink) hover:underline"
      >{{ name }}</a>
      <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button v-if="uploader" size="mini" @click="ctx.requestUpload(index, 'attachment')">
          更换
        </Button>
        <Button size="mini" status="danger" @click="remove">
          移除
        </Button>
      </div>
    </div>
    <div v-else class="flex items-center gap-2">
      <button
        v-if="uploader"
        type="button"
        class="flex h-20 w-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-(--line) text-[12px] text-(--ink-3) transition-colors hover:bg-(--panel-2)"
        @click="ctx.requestUpload(index, 'attachment')"
      >
        <span class="text-[18px]">＋</span>
        上传附件
      </button>
      <input
        :value="block.text"
        class="h-8 w-64 rounded-md border border-(--line) bg-transparent px-2 text-[12px] outline-none"
        placeholder="或粘贴文件地址"
        @input="ctx.editor.update(block.id, { text: ($event.target as HTMLInputElement).value })"
      >
    </div>
  </div>
</template>
