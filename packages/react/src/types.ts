import type { Block, Editor } from '@sword-editor/doc-editor'

/**
 * 自定义叶子块渲染器接收的 props
 */
export interface BlockRendererProps<T extends Record<string, any> = Record<string, any>> {
  /** 当前块所属的 SDK 实例 */
  editor: Editor
  block: Block<T>
  index: number
  /** 更新块字段（text / props / lang…） */
  update: (patch: Partial<Block<T>>) => void
  /** 删除当前块 */
  remove: () => void
}

/**
 * AI 能力统一走核心包插件体系：
 * - 使用方注入的适配器（generate / polish / image 纯函数）→ 别名 DocEditorAi；
 * - 由 createAiActions 包装成标准 AiAction 注册进编辑器。
 */
export type {
  AiAction,
  AiActionContext,
  AiActionResult,
  AiAdapter as DocEditorAi,
} from '@sword-editor/doc-editor'
