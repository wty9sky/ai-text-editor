<script setup lang="ts">
import type { Block } from '@sword-editor/doc-editor'
import { computed, inject } from 'vue'
import { EditorContextKey } from '../context.js'
import Button from '../ui/Button.vue'

const props = defineProps<{ block: Block, index: number }>()
const ctx = inject(EditorContextKey)!

const uploader = computed(() => ctx.uploaders.find(u => u.kind === 'image'))

function remove() {
  ctx.editor.remove([props.block.id])
}
</script>

<template>
  <div class="py-1">
    <div v-if="block.text" class="relative inline-block">
      <img :src="ctx.resolveUrl(block.text)" :alt="block.alt || '图片'" class="max-h-80 max-w-full rounded-lg border border-(--line)">
      <div class="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button v-if="uploader" size="mini" @click="ctx.requestUpload(index, 'image')">
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
        @click="ctx.requestUpload(index, 'image')"
      >
        <span class="text-[18px]">＋</span>
        上传图片
      </button>
      <input
        :value="block.text"
        class="h-8 w-64 rounded-md border border-(--line) bg-transparent px-2 text-[12px] outline-none"
        placeholder="或粘贴图片地址"
        @input="ctx.editor.update(block.id, { text: ($event.target as HTMLInputElement).value })"
      >
    </div>
  </div>
</template>
