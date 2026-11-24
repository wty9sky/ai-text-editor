<script setup lang="ts">
/**
 * 顶部工具栏：撤销/重做（插件项） + 插入菜单 + 导出菜单 + 自定义插件项
 */
import type { TextStyle } from '@sword-editor/doc-editor'
import { getTextStyle, TEXT_BLOCK_TYPES } from '@sword-editor/doc-editor'
import { computed, inject, onUnmounted, ref } from 'vue'
import { EditorContextKey } from './context.js'
import { resolveIcon } from './icons.js'
import Dropdown from './ui/Dropdown.vue'
import DropdownItem from './ui/DropdownItem.vue'

const ctx = inject(EditorContextKey)!
const editor = ctx.editor
const version = ref(0)
onUnmounted(editor.on(() => {
  version.value++
}))
const toolbarItems = computed(() => {
  void version.value
  return editor.plugins.toolbar.filter(item => !item.when || item.when({
    editor,
    selection: [...editor.selection],
    selectedBlocks: editor.selectedBlocks,
  }))
})
const insertables = computed(() => {
  void version.value
  return editor.plugins.listInsertableBlocks()
})
const exporters = computed(() => {
  void version.value
  return editor.plugins.listExporters()
})
const selected = computed(() => {
  void version.value
  return editor.selectedBlocks.filter(block => TEXT_BLOCK_TYPES.includes(block.type))
})
const activeStyle = computed(() => selected.value[0]
  ? getTextStyle(selected.value[0])
  : {})
function format(style: TextStyle) {
  if (!selected.value.length)
    return
  try {
    editor.execute('core.format', {
      ids: selected.value.map(block => block.id),
      style,
    })
  }
  catch (error) { editor.reportError(error) }
}
function convert(type: string) {
  if (!selected.value.length)
    return
  try {
    editor.transaction(() => {
      for (const block of selected.value) editor.convert(block.id, type)
    })
  }
  catch (error) { editor.reportError(error) }
}
function insertAtEnd(type: string) {
  const index = editor.blocks.length - 1
  ctx.insertBlock(type, index, true)
}
function onExport(id: string) {
  const exporter = editor.plugins.getExporter(id)
  if (!exporter)
    return
  exporter.export({
    editor,
    blocks: [...editor.blocks],
    markdown: ctx.toMarkdown(),
    title: ctx.exportTitle,
  })
}
</script>

<template>
  <div class="sword-toolbar" role="toolbar" aria-label="文档编辑工具栏">
    <span class="sword-toolbar-label">文字</span>
    <select aria-label="块类型" :disabled="!selected.length" :value="selected[0]?.type || ''" @change="convert(($event.target as HTMLSelectElement).value)">
      <option value="" disabled>
        选择文本块
      </option>
      <option v-for="type in TEXT_BLOCK_TYPES" :key="type" :value="type">
        {{ editor.plugins.getBlockType(type)?.label || type }}
      </option>
    </select>
    <select aria-label="文字大小" :disabled="!selected.length" :value="activeStyle.fontSize || ''" @change="format({ fontSize: Number(($event.target as HTMLSelectElement).value) })">
      <option value="" disabled>
        默认字号
      </option>
      <option v-for="size in [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96]" :key="size" :value="size">
        {{ size }} px
      </option>
    </select>
    <button type="button" class="sword-format-button" aria-label="粗体" :aria-pressed="!!activeStyle.bold" :disabled="!selected.length" @mousedown.prevent @click="format({ bold: !activeStyle.bold })">
      <strong>B</strong>
    </button>
    <button type="button" class="sword-format-button" aria-label="斜体" :aria-pressed="!!activeStyle.italic" :disabled="!selected.length" @mousedown.prevent @click="format({ italic: !activeStyle.italic })">
      <em>I</em>
    </button>
    <button type="button" class="sword-format-button" aria-label="下划线" :aria-pressed="!!activeStyle.underline" :disabled="!selected.length" @mousedown.prevent @click="format({ underline: !activeStyle.underline })">
      <u>U</u>
    </button>
    <select aria-label="文字对齐" :disabled="!selected.length" :value="activeStyle.align || 'left'" @change="format({ align: ($event.target as HTMLSelectElement).value as TextStyle['align'] })">
      <option value="left">
        左对齐
      </option><option value="center">
        居中
      </option><option value="right">
        右对齐
      </option>
    </select>
    <template v-for="item in toolbarItems" :key="item.id">
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded text-(--ink-3) transition-colors hover:bg-(--panel-2) hover:text-(--ink-1) disabled:cursor-not-allowed disabled:opacity-40"
        :title="item.label"
        @click="item.action({ editor, selection: [...editor.selection], selectedBlocks: editor.selectedBlocks })"
      >
        <component :is="resolveIcon(item.icon)" v-if="resolveIcon(item.icon)" class="size-4" />
        <span v-else>{{ item.label }}</span>
      </button>
    </template>

    <div class="mx-1 h-4 w-px bg-(--line)" />

    <Dropdown trigger="click" position="bl" @select="(v: any) => insertAtEnd(String(v))">
      <button
        type="button"
        class="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-(--ink-3) transition-colors hover:bg-(--panel-2) hover:text-(--ink-1)"
      >
        插入
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

    <Dropdown v-if="exporters.length" trigger="click" position="bl" @select="(v: any) => onExport(String(v))">
      <button
        type="button"
        class="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-(--ink-3) transition-colors hover:bg-(--panel-2) hover:text-(--ink-1)"
      >
        <component :is="resolveIcon('download')" class="size-3.5" />
        导出
      </button>
      <template #content>
        <DropdownItem v-for="e in exporters" :key="e.id" :value="e.id">
          {{ e.label }}
        </DropdownItem>
      </template>
    </Dropdown>
  </div>
</template>
