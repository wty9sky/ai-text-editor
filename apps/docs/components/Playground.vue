<script setup lang="ts">
import type { AiAdapter, DocumentEditorPlugin, EditorDocument, Uploader } from '@sword-editor/vue'
import { DocEditor as ReactDocEditor } from '@sword-editor/react'
import { createFunctionUploader, definePlugin, DocEditor, markdownToHtml } from '@sword-editor/vue'
/**
 * Playground：顶部切换技术栈（Vue / React），
 * 配置与等效代码位于编辑器上方，下方展示编辑器与预览，Vue / React 双技术栈同步。
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// ── 技术栈切换 ─────────────────────────────────────

type Stack = 'vue' | 'react'
const props = withDefaults(defineProps<{ stack?: Stack, lockStack?: boolean, mode?: 'document' | 'rich-text' }>(), { stack: 'vue' })
const activeStack = ref<Stack>(props.stack)

// ── 配置（Vue / React 共用） ───────────────────────

const markdown = ref(props.mode === 'document'
  ? '# 文档编辑器\n\n在此撰写文档，使用工具栏设置文字格式。\n\n## 章节标题\n\n支持块选择、撤销与导出。'
  : `# 图文编辑器 Playground

这是基于块的插件化编辑器。试试：

- 点左侧 + 插入标题 / 列表 / 代码 / 图片 / 视频 / 附件
- 在空白处拖框框选多个块后右键删除
- 顶部工具栏的撤销 / 重做、插入、导出
- 粘贴 / 拖拽图片走「被动上传」

> 下面这个「提示框」是自定义插件注册的块类型。`)

const demoDocument = ref<EditorDocument>()
const enableAi = ref(true)
const enableUpload = ref(true)

// callout 插件（核心 SDK，Vue / React 共用）
const calloutPlugin: DocumentEditorPlugin = definePlugin({
  name: 'demo.callout',
  install(ctx) {
    ctx.registerBlockType({
      type: 'callout',
      label: '提示框',
      icon: 'sparkles',
      leaf: true,
      defaultText: '这是一条提示',
      parse: (lines, index) => {
        const m = /^@\[callout\][\t ]+([^\t ].*)?$/.exec(lines[index])
        return m
          ? {
              text: m[1].trim(),
              consumed: 1,
            }
          : null
      },
      serialize: block => `@[callout] ${block.text}`,
    })
  },
})

// Vue 版 callout 渲染器
const CalloutRenderer = defineComponent({
  props: {
    block: { type: Object, required: true },
  },
  setup(props) {
    const b = props.block as any
    return () => h('div', {
      class: 'rounded-lg border border-(--accent-line) bg-(--accent-soft) px-3 py-2 text-[13px] text-(--accent-ink)',
    }, [
      h('div', {}, b.text),
    ])
  },
})

// React 版 callout 渲染器
function ReactCallout(props: any) {
  return createElement('div', {
    className: 'rounded-lg border border-(--accent-line) bg-(--accent-soft) px-3 py-2 text-[13px] text-(--accent-ink)',
  }, props.block.text)
}

function localUpload(file: File): Promise<{ url: string, name: string, size: number }> {
  return new Promise(resolve => resolve({
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
  }))
}

const uploaders: Uploader[] = [
  createFunctionUploader({
    kind: 'image',
    label: '图片',
    accept: 'image/*',
    upload: f => localUpload(f),
  }),
  createFunctionUploader({
    kind: 'video',
    label: '视频',
    accept: 'video/*',
    upload: f => localUpload(f),
  }),
  createFunctionUploader({
    kind: 'attachment',
    label: '附件',
    upload: f => localUpload(f),
  }),
]

const ai: AiAdapter = {
  generate: async instruction => `# ${instruction || 'AI 生成'}\n\n这是 AI 生成的示例（本地 mock）。\n\n- 支持一次生成多块`,
  polish: async (text, instruction) => `${text}\n\n（已按「${instruction || '更简洁'}」修饰，本地 mock）`,
  image: async () => `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#e0eaff"/><text x="400" y="230" font-size="28" fill="#2563eb" text-anchor="middle" font-family="sans-serif">AI 生成图片</text></svg>')}`,
}

// 等效代码（展示当前技术栈对应的用法）
const code = computed(() => {
  if (activeStack.value === 'react') {
    const lines = [
      '<DocEditor',
      '  document={document}',
      '  onDocumentChange={setDocument}',
      '  value={markdown}',
      '  onChange={setMarkdown}',
      '  title="playground"',
    ]
    if (enableAi.value)
      lines.push('  ai={ai}')
    if (enableUpload.value)
      lines.push('  uploaders={uploaders}')
    lines.push('  plugins={[calloutPlugin]}', '/>')
    return lines.join('\n')
  }
  const lines = [
    '<DocEditor',
    '  v-model:document="document"',
    '  v-model="markdown"',
    '  title="playground"',
  ]
  if (enableAi.value)
    lines.push('  :ai="ai"')
  if (enableUpload.value)
    lines.push('  :uploaders="uploaders"')
  lines.push('  :plugins="[calloutPlugin]"', '/>')
  return lines.join('\n')
})

// ── Vue 编辑器 + 预览 ───────────────────────────────

const be = ref<InstanceType<typeof DocEditor>>()
const previewHtml = computed(() => markdownToHtml(markdown.value))

// ── React 编辑器挂载 ───────────────────────────────

const reactHost = ref<HTMLDivElement>()
let reactRoot: ReturnType<typeof createRoot> | null = null

function renderReact() {
  if (!reactHost.value)
    return
  if (!reactRoot)
    reactRoot = createRoot(reactHost.value)
  reactRoot.render(createElement(ReactDocEditor, {
    key: `${enableAi.value}-${enableUpload.value}`,
    document: demoDocument.value,
    onDocumentChange: (value: EditorDocument) => { demoDocument.value = value },
    value: markdown.value,
    onChange: (v: string) => { markdown.value = v },
    title: 'playground',
    toolbar: true,
    plugins: [calloutPlugin],
    blockRenderers: { callout: ReactCallout },
    uploaders: enableUpload.value ? uploaders : undefined,
    ai: enableAi.value ? ai : undefined,
    minHeight: 320,
  }))
}

watch([markdown, enableAi, enableUpload], () => {
  if (activeStack.value === 'react')
    renderReact()
})

watch(activeStack, async (s) => {
  reactRoot?.unmount()
  reactRoot = null
  if (s === 'react') {
    await nextTick()
    renderReact()
  }
})

onMounted(() => {
  if (activeStack.value === 'react')
    renderReact()
})

onBeforeUnmount(() => {
  reactRoot?.unmount()
  reactRoot = null
})
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-(--line-strong) bg-(--panel)">
    <!-- 顶部：技术栈 + 编辑器类型切换 -->
    <div class="flex flex-wrap items-center gap-1 border-b border-(--line) bg-(--panel-1) px-3 py-2">
      <span class="mr-1 text-[11px] font-semibold uppercase tracking-wide text-(--ink-4)">技术栈</span>
      <span v-if="lockStack" class="px-3 py-1 text-[12px] font-medium">{{ activeStack === 'vue' ? 'Vue 3' : 'React' }}</span>
      <button
        v-if="!lockStack"
        type="button"
        class="rounded px-3 py-1 text-[12px] transition-colors"
        :class="activeStack === 'vue' ? 'bg-(--accent) text-white' : 'text-(--ink-2) hover:bg-(--panel-3)'"
        @click="activeStack = 'vue'"
      >
        Vue 3
      </button>
      <button
        v-if="!lockStack"
        type="button"
        class="rounded px-3 py-1 text-[12px] transition-colors"
        :class="activeStack === 'react' ? 'bg-(--accent) text-white' : 'text-(--ink-2) hover:bg-(--panel-3)'"
        @click="activeStack = 'react'"
      >
        React
      </button>
    </div>

    <div>
      <!-- 配置和等效代码 -->
      <div class="flex min-w-0 flex-col">
        <div class="grid grid-cols-1 gap-4 border-b border-(--line) bg-(--paper) p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div>
            <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--ink-3)">
              配置
            </div>
            <label class="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-(--ink-2)">
              <input v-model="enableAi" type="checkbox" class="accent-(--accent)">
              启用 AI
            </label>
            <label class="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-(--ink-2)">
              <input v-model="enableUpload" type="checkbox" class="accent-(--accent)">
              启用上传
            </label>
          </div>

          <div>
            <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--ink-3)">
              等效代码（{{ activeStack === 'vue' ? 'Vue' : 'React' }}）
            </div>
            <pre class="overflow-x-auto rounded-md bg-(--panel-3) p-2 font-mono text-[11px] leading-relaxed text-(--ink-1)">{{ code }}</pre>
          </div>
        </div>

        <!-- 编辑器 + 预览 -->
        <div class="flex min-w-0 flex-col gap-0">
          <div class="border-b border-(--line) p-4">
            <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-(--ink-3)">
              编辑器（{{ activeStack === 'vue' ? 'Vue 3' : 'React' }}）
            </div>
            <DocEditor
              v-if="activeStack === 'vue'"
              :key="`${enableAi}-${enableUpload}`"
              ref="be"
              v-model:document="demoDocument"
              v-model="markdown"
              title="playground"
              :toolbar="true"
              :plugins="[calloutPlugin]"
              :block-renderers="{ callout: CalloutRenderer }"
              :uploaders="enableUpload ? uploaders : undefined"
              :ai="enableAi ? ai : undefined"
              :min-height="320"
              :max-height="480"
            />
            <div v-else ref="reactHost" />
          </div>
          <div class="p-4">
            <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-(--ink-3)">
              预览
            </div>
            <div class="md-preview" v-html="previewHtml" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
