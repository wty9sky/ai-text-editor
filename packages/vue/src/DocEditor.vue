<script setup lang="ts">
import type { DocEditorPlugin, EditorDocument, Exporter, Uploader, UploadKind } from '@sword-editor/doc-editor'
/**
 * 块编辑器主组件：组装 Toolbar + EditorCanvas + ContextMenu + AI 弹窗
 *
 * - 内部持有 Editor（块 + 多选 + undo/redo），通过插件体系扩展；
 * - v-model 绑定 Markdown，内部做 Markdown ↔ 块 双向转换；
 * - 上传多场景：主动（按钮选文件）/ 被动（粘贴、拖拽）都复用同一组 Uploader；
 * - 导出：md / docx / pdf / png 由内置导出器提供，可被 exporters 覆盖 / 扩展。
 */
import type { Component } from 'vue'
import type { DocEditorAi } from './types.js'
import { SparklesIcon } from '@lucide/vue'
import { AiSession, blocksToMarkdown, captureTarget, createBlock, createFeaturePlugins, DEFAULT_PLUGINS, Editor, markdownToBlocks, syncDocument, uploadFile } from '@sword-editor/doc-editor'
import { computed, nextTick, onUnmounted, provide, reactive, ref, watch } from 'vue'
import { EditorContextKey, EditorKey } from './context.js'
import EditorCanvas from './EditorCanvas.vue'
import { createDefaultExporters } from './export.js'
import { vueRenderersPlugin } from './renderers.js'
import Toolbar from './Toolbar.vue'
import Button from './ui/Button.vue'
import Modal from './ui/Modal.vue'
import Textarea from './ui/Textarea.vue'

const props = withDefaults(defineProps<{
  document?: EditorDocument
  ariaLabel?: string
  modelValue?: string
  /** 文档标题（导出文件名用） */
  title?: string
  /** 额外插件 */
  plugins?: DocEditorPlugin[]
  /** 自定义叶子块渲染器：type → 组件 */
  blockRenderers?: Record<string, Component>
  /** 上传器（图片 / 视频 / 附件） */
  uploaders?: Uploader[]
  /** 额外 / 覆盖的导出器 */
  exporters?: Exporter[]
  ai?: DocEditorAi
  resolveUrl?: (url: string) => string
  placeholder?: string
  minHeight?: string | number
  maxHeight?: string | number
  /** 是否显示顶部工具栏 */
  toolbar?: boolean
  /** 上传目录（透传给上传器） */
  dir?: string
}>(), {
  modelValue: undefined,
  title: '',
  plugins: undefined,
  blockRenderers: undefined,
  uploaders: undefined,
  exporters: undefined,
  ai: undefined,
  resolveUrl: (url: string) => url,
  placeholder: '输入「/」或点左侧 + 插入块…',
  minHeight: undefined,
  maxHeight: undefined,
  toolbar: true,
  dir: 'content',
})
const emit = defineEmits<{
  (e: 'update:document', value: EditorDocument): void
  (e: 'error', error: unknown): void
  (e: 'update:modelValue', value: string): void
}>()
// ── 构造编辑器 + 插件 ─────────────────────────────────
function buildPlugins(): DocEditorPlugin[] {
  return [
    vueRenderersPlugin,
    ...createFeaturePlugins({
      ...props,
      exporters: [
        ...createDefaultExporters(),
        ...props.exporters ?? [],
      ],
    }),
  ]
}
const editor = new Editor({
  plugins: [
    ...DEFAULT_PLUGINS,
    ...buildPlugins(),
  ],
})
function toMarkdown(): string {
  return blocksToMarkdown(editor.blocks, editor.plugins.blockTypes)
}
// 外部 setBlocks（切换文档）时抑制回传，避免触发 markDirty / 覆盖父组件
let syncing = false
const offChange = editor.on((event) => {
  if (event === 'error')
    emit('error', editor.errors.at(-1))
  if (event === 'change' && !syncing) {
    emit('update:modelValue', toMarkdown())
    emit('update:document', editor.toDocument())
  }
})
// ── v-model 同步 ─────────────────────────────────────
watch([
  () => props.document,
  () => props.modelValue,
], ([document, val]) => {
  if (document !== undefined) {
    syncing = true
    try {
      syncDocument(editor, document)
    }
    catch (error) { editor.reportError(error) }
    finally { syncing = false }
    return
  }
  if (val === undefined || val === toMarkdown())
    return
  syncing = true
  try {
    editor.setBlocks(markdownToBlocks(val, editor.plugins.blockTypes))
  }
  finally {
    syncing = false
  }
}, { immediate: true })
// ── 渲染版本（让模板随 editor 变化重渲染） ─────────────
const version = ref(0)
const offVersion = editor.on(() => {
  version.value += 1
})
// ── 提供给子组件 ─────────────────────────────────────
const containerRef = ref<HTMLDivElement>()
function focusBlock(index: number) {
  nextTick(() => {
    const el = containerRef.value?.querySelector(`[data-block-index="${index}"], [data-block-id="${editor.blocks[index]?.id}"] [data-editor-focus]`) as HTMLElement | null
    el?.focus()
  })
}
function insertBlock(type: string, index: number, focus = true, text = '') {
  const def = editor.plugins.getBlockType(type)
  const block = createBlock(type, text || (def?.defaultText ?? ''))
  editor.insert(index + 1, block)
  if (focus && !def?.leaf)
    nextTick(() => focusBlock(index + 1))
}
const fileInput = ref<HTMLInputElement>()
const pendingUpload = ref<{
  target: ReturnType<typeof captureTarget>
  kind: UploadKind
} | null>(null)
const tasks = new AbortController()
let aiSession: AiSession | undefined
onUnmounted(() => {
  tasks.abort()
  aiSession?.dispose()
  offChange()
  offVersion()
  try {
    editor.destroy()
  }
  catch (error) {
    editor.reportError(error)
  }
})
function requestUpload(index: number, kind: UploadKind) {
  const uploader = editor.plugins.listUploaders().find(u => u.kind === kind)
  if (!uploader)
    return
  pendingUpload.value = {
    target: captureTarget(editor, editor.blocks[index]?.id),
    kind,
  }
  fileInput.value!.accept = uploader.accept ?? (kind === 'image'
    ? 'image/*'
    : kind === 'video'
      ? 'video/*'
      : '*/*')
  fileInput.value!.click()
}
async function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !pendingUpload.value)
    return
  const { target, kind } = pendingUpload.value
  pendingUpload.value = null
  try {
    await uploadFile(editor, file, {
      target,
      kind,
      dir: props.dir,
      signal: tasks.signal,
    })
  }
  catch (error) {
    if (!tasks.signal.aborted)
      editor.reportError(error)
  }
}
// ── 被动上传（粘贴 / 拖拽） ───────────────────────────
async function uploadFiles(files: File[]) {
  const target = captureTarget(editor)
  for (const file of files) {
    try {
      await uploadFile(editor, file, { target, dir: props.dir, signal: tasks.signal })
    }
    catch (error) {
      if (!tasks.signal.aborted)
        editor.reportError(error)
    }
  }
}
function onPaste(e: ClipboardEvent) {
  const files = Array.from(e.clipboardData?.files ?? [])
  if (!files.length)
    return
  e.preventDefault()
  uploadFiles(files)
}
function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files'))
    e.preventDefault()
}
function onDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length)
    return
  e.preventDefault()
  uploadFiles(files)
}
// ── AI（由插件注册的 AiAction 驱动） ─────────────────
const ai = reactive({
  visible: false,
  actionId: '' as string,
  index: -1,
  blockId: '',
  instruction: '',
  loading: false,
  resultText: '',
  resultImage: '',
})
const activeAction = computed(() => {
  void version.value
  return editor.plugins.getAiAction(ai.actionId)
})
function openAi(actionId: string, index: number) {
  aiSession?.dispose()
  aiSession = new AiSession(editor, actionId, editor.blocks[index]?.id)
  ai.actionId = actionId
  ai.index = index
  ai.blockId = editor.blocks[index]?.id ?? ''
  ai.instruction = ''
  ai.resultText = ''
  ai.resultImage = ''
  ai.loading = false
  ai.visible = true
}
async function runAi() {
  const action = activeAction.value
  if (!action || !ai.instruction.trim())
    return
  const instruction = ai.instruction.trim()
  ai.loading = true
  ai.resultText = ''
  ai.resultImage = ''
  const session = aiSession
  try {
    const result = await session!.run(instruction)
    if (session !== aiSession || !ai.visible)
      return
    ai.resultText = result.text ?? ''
    ai.resultImage = result.image ?? ''
  }
  catch (error) {
    if (session === aiSession && ai.visible)
      editor.reportError(error)
  }
  finally {
    if (session === aiSession)
      ai.loading = false
  }
}
function applyAi() {
  try {
    aiSession?.apply()
    ai.visible = false
  }
  catch (error) {
    editor.reportError(error)
  }
}
watch(() => ai.visible, (visible) => {
  if (!visible)
    aiSession?.dispose()
})
// ── 提供上下文 ─────────────────────────────────────
function resolveUrl(url: string): string {
  return props.resolveUrl(url)
}
provide(EditorKey, editor)
provide(EditorContextKey, {
  editor,
  resolveUrl,
  get uploaders() {
    void version.value
    return editor.plugins.listUploaders()
  },
  get blockRenderers() {
    return props.blockRenderers ?? {}
  },
  get placeholder() {
    return props.placeholder
  },
  focusBlock,
  insertBlock,
  requestUpload,
  openAi,
  toMarkdown,
  get exportTitle() {
    return props.title
  },
})
// 暴露给外部（Playground 顶部工具栏 / 文档站复用）
defineExpose({
  editor,
  toMarkdown,
  insertBlock,
  requestUpload,
})
</script>

<template>
  <div ref="containerRef" class="sword-editor flex flex-col gap-1" role="region" :aria-label="ariaLabel || title || '文档编辑器'" @paste="onPaste" @dragover="onDragOver" @drop="onDrop">
    <slot>
      <Toolbar v-if="toolbar" />
      <EditorCanvas :min-height="minHeight" :max-height="maxHeight" />
    </slot>

    <input ref="fileInput" type="file" class="hidden" @change="onPickFile">

    <!-- AI 弹窗 -->
    <Modal v-if="activeAction" :visible="ai.visible" :width="560" :footer="false" @cancel="ai.visible = false">
      <template #title>
        <span class="flex items-center gap-1.5">
          <SparklesIcon class="size-4 text-(--accent-ink)" />
          {{ activeAction.label }}
        </span>
      </template>
      <div class="flex flex-col gap-3">
        <div v-if="activeAction.kind === 'polish'" class="rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2">
          <div class="mb-1 text-[11px] text-(--ink-4)">
            原文
          </div>
          <div class="max-h-28 overflow-y-auto whitespace-pre-wrap text-[13px] text-(--ink-2)">
            {{ editor.getBlock(ai.blockId)?.text || '' }}
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-[13px] font-medium">
            {{ activeAction.kind === 'generate' ? '想写什么' : activeAction.kind === 'polish' ? '修饰要求（可选）' : '图片描述' }}
          </label>
          <Textarea v-model="ai.instruction" :min-rows="2" :max-rows="5" :placeholder="activeAction.kind === 'generate' ? '例如：写一段项目简介，突出亮点' : activeAction.kind === 'polish' ? '例如：更正式、更简洁' : '例如：一张浅蓝色背景的科技感插画'" />
        </div>
        <Button type="primary" :loading="ai.loading" class="self-start" @click="runAi">
          {{ ai.loading ? '生成中…' : '生成' }}
        </Button>
        <div v-if="activeAction.kind !== 'image' && ai.resultText" class="flex flex-col gap-1.5">
          <div class="text-[11px] text-(--ink-4)">
            结果
          </div>
          <div class="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--line) px-3 py-2 text-[13px] text-(--ink-2)">
            {{ ai.resultText }}
          </div>
          <Button type="primary" class="self-end" @click="applyAi">
            {{ activeAction.kind === 'polish' ? '替换文本' : '插入文档' }}
          </Button>
        </div>
        <div v-else-if="activeAction.kind === 'image' && ai.resultImage" class="flex flex-col gap-1.5">
          <img :src="resolveUrl(ai.resultImage)" alt="AI 生成" class="max-h-72 w-full rounded-lg border border-(--line) object-contain">
          <Button type="primary" class="self-end" @click="applyAi">
            插入图片块
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
