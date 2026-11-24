import type { Editor, Uploader, UploadKind } from '@sword-editor/doc-editor'
import type { ComponentType } from 'react'
import type { BlockRendererProps } from './types.js'
import { createContext, useContext } from 'react'

export interface DocEditorContextValue {
  editor: Editor
  resolveUrl: (url: string) => string
  uploaders: Uploader[]
  blockRenderers: Record<string, ComponentType<BlockRendererProps>>
  placeholder: string
  focusBlock: (index: number) => void
  insertBlock: (type: string, index: number, focus?: boolean, text?: string) => void
  requestUpload: (index: number, kind: UploadKind) => void
  /** 打开 AI 弹窗：actionId 为插件注册的 AiAction.id */
  openAi: (actionId: string, index: number) => void
}

export const DocEditorContext = createContext<DocEditorContextValue | null>(null)

export function useDocEditor(): DocEditorContextValue {
  const ctx = useContext(DocEditorContext)
  if (!ctx)
    throw new Error('useDocEditor 必须在 <DocEditor> 内部使用')
  return ctx
}
