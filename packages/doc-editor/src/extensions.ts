import type { Editor } from './editor.js'
/**
 * 扩展点类型定义
 *
 * 插件通过 PluginContext 向这些扩展点挂载能力：
 * - 块类型（block type）：定义可插入 / 可解析的新块；
 * - 工具栏项（toolbar item）：编辑器工具栏上的按钮 / 动作；
 * - 右键菜单项（context menu item）：单块或多块选中时的右键动作；
 * - 导出器（exporter）：把整篇文档导出为 md / docx / pdf / png 等格式；
 * - 上传器（uploader）：图片 / 视频 / 附件的上传实现（action / 函数 / OSS…）。
 */
import type { Block } from './types.js'
/** 工具栏动作上下文 */
export interface ToolbarActionContext {
  editor: Editor
  /** 当前选中的块 id（可能为空） */
  selection: readonly string[]
  /** 当前选中的块 */
  selectedBlocks: readonly Block[]
}
/** 块级动作上下文（右键菜单项收到这个） */
export interface EditorActionContext {
  editor: Editor
  /** 触发动作的那个块（右键命中的块） */
  block: Block
  /** 该块在 blocks 里的下标 */
  index: number
  /** 当前选中的块 id（多选时是全部选中块） */
  selection: readonly string[]
  /** 当前选中的块 */
  selectedBlocks: readonly Block[]
}
/** 工具栏项 */
export interface ToolbarItem {
  /** 唯一 id */
  id: string
  label: string
  /** lucide 图标 key */
  icon?: string
  /** 分组（UI 层据此分隔 / 排序） */
  group?: string
  /** 返回 false 时隐藏该项 */
  when?: (ctx: ToolbarActionContext) => boolean
  action: (ctx: ToolbarActionContext) => void
}
/** 右键菜单项 */
export interface ContextMenuItem {
  /** 唯一 id */
  id: string
  label: string
  icon?: string
  /** 分组：ai / transform / operation / plugin … */
  group?: string
  /** 危险操作（红色显示） */
  danger?: boolean
  /** 返回 false 时隐藏该项 */
  when?: (ctx: EditorActionContext) => boolean
  action: (ctx: EditorActionContext) => void
}
/** 导出上下文 */
export interface ExportContext {
  editor: Editor
  /** 整篇文档的块（按顺序） */
  blocks: readonly Block[]
  /** 整篇文档序列化后的 Markdown */
  markdown: string
  /** 文档标题（可由调用方提供） */
  title?: string
  /** 编辑器根 DOM 元素（PNG 截图类导出器用它取画面） */
  container?: HTMLElement
}
/** 导出器：把文档导出为某种格式（md / docx / pdf / png …） */
export interface Exporter {
  /** 唯一 id：markdown / docx / pdf / png … */
  id: string
  label: string
  /** 文件扩展名（如 md / docx / pdf / png） */
  extension?: string
  /** MIME 类型 */
  mime?: string
  export: (ctx: ExportContext) => void | Promise<void>
}
/** 上传选项 */
export interface UploadOptions {
  signal?: AbortSignal
  /** 上传目录（透传给上传实现） */
  dir?: string
  /** 进度回调：已传字节 / 总字节 */
  onProgress?: (loaded: number, total: number) => void
}
/** 上传结果 */
export interface UploadResult {
  /** 可访问的地址 */
  url: string
  /** 原始文件名（附件块展示用） */
  name?: string
  mime?: string
  size?: number
  /** 附加到块的 props（视频封面、附件大小等） */
  props?: Record<string, any>
}
/** 上传资源类别 */
export type UploadKind = 'image' | 'video' | 'attachment'
/** AI 操作上下文（执行 / 应用结果时传入） */
export interface AiActionContext {
  editor: Editor
  /** 触发块（右键命中的块，可能为 undefined） */
  block?: Block
  /** 触发块下标 */
  index: number
  /** 用户输入的指令 / 描述 */
  instruction: string
  context?: Readonly<Record<string, unknown>>
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}
/** AI 操作结果 */
export interface AiActionResult {
  /** 文本结果（generate / polish 返回 Markdown 或文本） */
  text?: string
  /** 图片结果（image 返回地址） */
  image?: string
}
/**
 * AI 操作：一个可插拔的 AI 能力（生成内容 / 修饰文本 / 生成图片）。
 *
 * 插件通过 `ctx.registerAiAction` 注册后，UI 层自动在右键菜单呈现，并在弹窗里
 * 引导用户输入指令 → 调用 `run` 拿结果 → 用 `apply`（或按 kind 的内置逻辑）写回编辑器。
 * 这样 AI 也走插件体系，组件层不再硬编码 AI 行为。
 */
export interface AiAction {
  /** 唯一 id（如 ai.generate / ai.polish / ai.image） */
  id: string
  label: string
  icon?: string
  /** 交互形态：决定弹窗 UI（是否展示原文 / 结果形态）与默认应用方式 */
  kind: 'generate' | 'polish' | 'image'
  /** 执行 AI 调用，返回结果 */
  run: (ctx: AiActionContext) => Promise<AiActionResult>
  /** 把结果应用到编辑器；缺省时由 UI 层按 kind 使用内置应用逻辑 */
  apply?: (ctx: AiActionContext, result: AiActionResult) => void
}
/**
 * AI 适配器：使用方注入的纯函数（对接具体后端）。
 * 由 `createAiActions` 包装成三个标准 AiAction 注册进插件体系。
 */
export interface AiAdapter {
  /** 生成内容：返回 Markdown */
  generate?: (instruction: string, options?: {
    signal?: AbortSignal
  }) => Promise<string>
  /** 修饰文本：返回修饰后的文本 */
  polish?: (text: string, instruction: string, options?: {
    signal?: AbortSignal
  }) => Promise<string>
  /** 生成图片：返回图片地址 */
  image?: (instruction: string, options?: {
    signal?: AbortSignal
  }) => Promise<string>
}
/**
 * 上传器：一个可插拔的上传实现。
 *
 * 适配多种场景：
 * - action 上传：POST 到固定 action 地址（见 upload.ts 的 createActionUploader）；
 * - 函数上传：调用方给一个 `(file, options) => Promise<UploadResult>`，
 *   内部对接 OSS / MinIO / 自有存储（见 createFunctionUploader）；
 * - 主动 / 被动上传是 UI 层语义（点按钮选文件 vs 粘贴 / 拖拽），
 *   两者都复用同一个 Uploader。
 */
export interface Uploader {
  id: string
  label: string
  /** 资源类别，决定落成 image / video / attachment 块 */
  kind: UploadKind
  /** 文件选择器 accept（如 image/* / video/*） */
  accept?: string
  upload: (file: File, options: UploadOptions) => Promise<UploadResult>
}
