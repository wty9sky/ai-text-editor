import type { Editor, Uploader, UploadKind } from '@sword-editor/doc-editor'
/**
 * 组件间共享上下文（provide / inject）
 */
import type { Component, InjectionKey } from 'vue'

export interface DocEditorContext {
  editor: Editor
  /** 地址解析：相对路径 → 完整 URL */
  resolveUrl: (url: string) => string
  /** 可用上传器（图片 / 视频 / 附件） */
  uploaders: Uploader[]
  /** 自定义叶子块渲染器：type → 组件 */
  blockRenderers: Record<string, Component>
  placeholder: string
  /** 聚焦第 index 个块的输入框 */
  focusBlock: (index: number) => void
  /** 在第 index 个块后插入一个块（供 Enter / 插入菜单用）；text 为拆块时的后续文本 */
  insertBlock: (type: string, index: number, focus?: boolean, text?: string) => void
  /** 触发第 index 个块的上传（弹出文件选择器，按资源类别匹配上传器） */
  requestUpload: (index: number, kind: UploadKind) => void
  /** 打开 AI 弹窗：actionId 为插件注册的 AiAction.id */
  openAi: (actionId: string, index: number) => void
  /** 当前块 → Markdown */
  toMarkdown: () => string
  /** 导出用文档标题 */
  exportTitle?: string
}

export const EditorKey: InjectionKey<Editor> = Symbol('doc-editor:editor')
export const EditorContextKey: InjectionKey<DocEditorContext> = Symbol('doc-editor:context')
