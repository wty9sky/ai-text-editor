import type { AiAdapter, DocEditorPlugin, EditorDocument, Exporter, Uploader, UploadKind } from '@sword-editor/doc-editor'
import type { ComponentType } from 'react'
import type { DocEditorContextValue } from './context.js'
import type { BlockRendererProps } from './types.js'
import { AiSession, blocksToMarkdown, captureTarget, createBlock, createFeaturePlugins, DEFAULT_PLUGINS, Editor, markdownToBlocks, syncDocument, uploadFile } from '@sword-editor/doc-editor'
import { Sparkles } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState } from 'react'
import { DocEditorContext } from './context.js'
import { EditorCanvas } from './EditorCanvas.js'
import { createDefaultExporters } from './export.js'
import { reactRenderersPlugin } from './renderers.js'
import { Toolbar } from './Toolbar.js'

export interface DocEditorProps {
  children?: import('react').ReactNode
  document?: EditorDocument
  onDocumentChange?: (document: EditorDocument) => void
  onError?: (error: unknown) => void
  ariaLabel?: string
  value?: string
  onChange?: (value: string) => void
  title?: string
  plugins?: DocEditorPlugin[]
  blockRenderers?: Record<string, ComponentType<BlockRendererProps>>
  uploaders?: Uploader[]
  exporters?: Exporter[]
  ai?: AiAdapter
  resolveUrl?: (url: string) => string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  toolbar?: boolean
  dir?: string
}
/** 通过 ref 暴露给外部的编辑器能力（对齐 Vue 版 defineExpose） */
export interface DocEditorRef {
  editor: Editor
  toMarkdown: () => string
  insertBlock: (type: string, index: number, focus?: boolean, text?: string) => void
  requestUpload: (index: number, kind: UploadKind) => void
}
interface AiState {
  visible: boolean
  actionId: string
  index: number
  blockId: string
  instruction: string
  loading: boolean
  resultText: string
  resultImage: string
}
const DocEditorView = forwardRef<DocEditorRef, DocEditorProps & {
  editor: Editor
}>((props, ref) => {
  const { editor } = props
  const { value, onChange, title, blockRenderers = {}, resolveUrl = (url: string) => url, placeholder = '输入「/」或点左侧 + 插入块…', minHeight, maxHeight, toolbar = true, dir = 'content' } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<{
    target: ReturnType<typeof captureTarget>
    kind: UploadKind
  } | null>(null)
  const aiSession = useRef<AiSession | null>(null)
  const tasks = useRef(new AbortController())
  const syncingRef = useRef(false)
  const [, forceUpdate] = useReducer(x => x + 1, 0)
  useEffect(() => editor.on(() => forceUpdate()), [editor])
  function toMarkdown(): string {
    return blocksToMarkdown(editor.blocks, editor.plugins.blockTypes)
  }
  // ── value 同步（受控） ───────────────────────────────
  useEffect(() => {
    if (props.document !== undefined) {
      syncingRef.current = true
      try {
        syncDocument(editor, props.document)
      }
      catch (error) { editor.reportError(error) }
      finally { syncingRef.current = false }
      return
    }
    if (value === undefined || value === toMarkdown())
      return
    syncingRef.current = true
    try {
      editor.setBlocks(markdownToBlocks(value, editor.plugins.blockTypes))
    }
    finally {
      syncingRef.current = false
    }
  }, [editor, value, props.document])
  useEffect(() => {
    return editor.on((event) => {
      if (event === 'error')
        props.onError?.(editor.errors.at(-1))
      if (event === 'change' && !syncingRef.current) {
        onChange?.(toMarkdown())
        props.onDocumentChange?.(editor.toDocument())
      }
    })
  }, [
    editor,
    onChange,
    props.onDocumentChange,
    props.onError,
  ])
  // ── 交互辅助 ─────────────────────────────────────────
  function focusBlock(index: number) {
    requestAnimationFrame(() => {
      containerRef.current?.querySelector<HTMLElement>(`[data-block-index="${index}"], [data-block-id="${editor.blocks[index]?.id}"] [data-editor-focus]`)?.focus()
    })
  }
  function insertBlock(type: string, index: number, focus = true, text = '') {
    const def = editor.plugins.getBlockType(type)
    const block = createBlock(type, text || (def?.defaultText ?? ''))
    editor.insert(index + 1, block)
    if (focus && !def?.leaf)
      focusBlock(index + 1)
  }
  function requestUpload(index: number, kind: UploadKind) {
    const uploader = editor.plugins.listUploaders().find(u => u.kind === kind)
    if (!uploader)
      return
    pendingUpload.current = {
      target: captureTarget(editor, editor.blocks[index]?.id),
      kind,
    }
    const input = fileInputRef.current
    if (!input)
      return
    input.accept = uploader.accept ?? (kind === 'image'
      ? 'image/*'
      : kind === 'video'
        ? 'video/*'
        : '*/*')
    input.click()
  }
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (!file || !pendingUpload.current)
      return
    const { target, kind } = pendingUpload.current
    pendingUpload.current = null
    try {
      await uploadFile(editor, file, {
        target,
        kind,
        dir,
        signal: tasks.current.signal,
      })
    }
    catch (error) {
      if (!tasks.current.signal.aborted)
        editor.reportError(error)
    }
  }
  // ── 被动上传（粘贴 / 拖拽） ───────────────────────────
  async function uploadFiles(files: File[]) {
    const target = captureTarget(editor)
    for (const file of files) {
      try {
        await uploadFile(editor, file, { target, dir, signal: tasks.current.signal })
      }
      catch (error) {
        if (!tasks.current.signal.aborted)
          editor.reportError(error)
      }
    }
  }
  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (!files.length)
      return
    e.preventDefault()
    uploadFiles(files)
  }
  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (!files.length)
      return
    e.preventDefault()
    uploadFiles(files)
  }
  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer?.types.includes('Files'))
      e.preventDefault()
  }
  // ── AI（由插件注册的 AiAction 驱动） ─────────────────
  const [aiState, setAiState] = useState<AiState>({
    visible: false,
    actionId: '',
    index: -1,
    blockId: '',
    instruction: '',
    loading: false,
    resultText: '',
    resultImage: '',
  })
  const activeAction = editor.plugins.getAiAction(aiState.actionId)
  function openAi(actionId: string, index: number) {
    aiSession.current?.dispose()
    aiSession.current = new AiSession(editor, actionId, editor.blocks[index]?.id)
    setAiState({
      visible: true,
      actionId,
      index,
      blockId: editor.blocks[index]?.id ?? '',
      instruction: '',
      loading: false,
      resultText: '',
      resultImage: '',
    })
  }
  async function runAi() {
    if (!activeAction || !aiState.instruction.trim())
      return
    const instruction = aiState.instruction.trim()
    setAiState(s => ({
      ...s,
      loading: true,
      resultText: '',
      resultImage: '',
    }))
    const session = aiSession.current
    try {
      const result = await session!.run(instruction)
      if (session !== aiSession.current)
        return
      setAiState(s => ({ ...s, resultText: result.text ?? '', resultImage: result.image ?? '' }))
    }
    catch (error) {
      if (session === aiSession.current && !tasks.current.signal.aborted)
        editor.reportError(error)
    }
    finally {
      if (session === aiSession.current && !tasks.current.signal.aborted)
        setAiState(s => ({ ...s, loading: false }))
    }
  }
  function applyAi() {
    try {
      aiSession.current?.apply()
      setAiState(s => ({ ...s, visible: false }))
    }
    catch (error) {
      editor.reportError(error)
    }
  }
  useEffect(() => {
    if (!aiState.visible)
      aiSession.current?.dispose()
  }, [aiState.visible])
  useEffect(() => {
    tasks.current = new AbortController()
    return () => {
      tasks.current.abort()
      aiSession.current?.dispose()
    }
  }, [editor])
  // ── 暴露给外部（对标 Vue 版 defineExpose） ───────────
  useImperativeHandle(ref, () => ({
    editor,
    toMarkdown,
    insertBlock,
    requestUpload,
  }))
  // ── Context ─────────────────────────────────────────
  const ctxValue: DocEditorContextValue = {
    editor,
    resolveUrl,
    uploaders: editor.plugins.listUploaders(),
    blockRenderers,
    placeholder,
    focusBlock,
    insertBlock,
    requestUpload,
    openAi,
  }
  return (
    <DocEditorContext.Provider value={ctxValue}>
      <div ref={containerRef} className="sword-editor flex flex-col gap-1" role="region" aria-label={props.ariaLabel ?? title ?? '文档编辑器'} onPaste={onPaste} onDragOver={onDragOver} onDrop={onDrop}>
        {props.children ?? (
          <>
            {toolbar && <Toolbar title={title} />}
            <EditorCanvas minHeight={minHeight} maxHeight={maxHeight} />
          </>
        )}

        <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />

        {aiState.visible && activeAction && (
          <div className="fixed inset-0 z-1001 flex items-center justify-center bg-black/30" onClick={() => setAiState(s => ({ ...s, visible: false }))}>
            <div className="w-[560px] max-w-[92vw] rounded-xl border border-(--line) bg-(--bg) p-5 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="mb-3 flex items-center gap-1.5">
                <Sparkles className="size-4 text-(--accent-ink)" />
                <span className="text-[15px] font-medium">{activeAction.label}</span>
              </div>

              {activeAction.kind === 'polish' && (
                <div className="mb-3 rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2">
                  <div className="mb-1 text-[11px] text-(--ink-4)">原文</div>
                  <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[13px] text-(--ink-2)">
                    {editor.getBlock(aiState.blockId)?.text || ''}
                  </div>
                </div>
              )}

              <label className="mb-1.5 block text-[13px] font-medium">
                {activeAction.kind === 'generate'
                  ? '想写什么'
                  : activeAction.kind === 'polish'
                    ? '修饰要求（可选）'
                    : '图片描述'}
              </label>
              <textarea
                value={aiState.instruction}
                rows={3}
                placeholder={activeAction.kind === 'generate'
                  ? '例如：写一段项目简介'
                  : activeAction.kind === 'polish'
                    ? '例如：更正式、更简洁'
                    : '例如：一张浅蓝色背景的科技感插画'}
                className="mb-3 w-full resize-none rounded-md border border-(--line) bg-transparent px-3 py-2 text-[13px] outline-none focus:border-(--accent-line)"
                onChange={e => setAiState(s => ({ ...s, instruction: e.target.value }))}
              />

              <button type="button" className="rounded-md bg-(--accent) px-4 py-1.5 text-[13px] text-white disabled:opacity-60" disabled={aiState.loading} onClick={runAi}>
                {aiState.loading ? '生成中…' : '生成'}
              </button>

              {activeAction.kind !== 'image' && aiState.resultText && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] text-(--ink-4)">结果</div>
                  <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--line) px-3 py-2 text-[13px] text-(--ink-2)">
                    {aiState.resultText}
                  </div>
                  <button type="button" className="mt-2 ml-auto block rounded-md bg-(--accent) px-4 py-1.5 text-[13px] text-white" onClick={applyAi}>
                    {activeAction.kind === 'polish'
                      ? '替换文本'
                      : '插入文档'}
                  </button>
                </div>
              )}

              {activeAction.kind === 'image' && aiState.resultImage && (
                <div className="mt-3">
                  <img src={resolveUrl(aiState.resultImage)} alt="AI 生成" className="max-h-72 w-full rounded-lg border border-(--line) object-contain" />
                  <button type="button" className="mt-2 ml-auto block rounded-md bg-(--accent) px-4 py-1.5 text-[13px] text-white" onClick={applyAi}>
                    插入图片块
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DocEditorContext.Provider>
  )
})
function buildPlugins(props: DocEditorProps): DocEditorPlugin[] {
  return [
    reactRenderersPlugin,
    ...createFeaturePlugins({
      ...props,
      exporters: [
        ...createDefaultExporters(),
        ...props.exporters ?? [],
      ],
    }),
  ]
}
export const DocEditor = forwardRef<DocEditorRef, DocEditorProps>((props, ref) => {
  const initial = useRef(props)
  const [editor, setEditor] = useState<Editor | null>(null)
  useEffect(() => {
    const instance = new Editor({
      plugins: [
        ...DEFAULT_PLUGINS,
        ...buildPlugins(initial.current),
      ],
    })
    setEditor(instance)
    return () => {
      try {
        instance.destroy()
      }
      catch (error) {
        instance.reportError(error)
      }
    }
  }, [])
  return editor
    ? <DocEditorView {...props} editor={editor} ref={ref} />
    : null
})
