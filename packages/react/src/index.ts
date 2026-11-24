/**
 * @sword-editor/react —— 块编辑器 React 封装
 *
 * 以 <DocEditor> 为核心的受控组件，连接 @sword-editor/doc-editor 引擎与 React UI：
 * - 所有操作（块类型 / 工具栏 / 右键菜单 / 导出 / 上传 / AI）统一走插件体系；
 * - DocEditor：受控 markdown value/onChange 的主编辑器组件（ref 可访问 editor 与方法）；
 * - useDocEditor：编辑器上下文 hook（自定义块渲染器 / 扩展 UI 用）；
 * - createAiActions / createAiAdapter：把 AI 适配器包装成标准操作 / 用配置接入大模型。
 *
 * 样式：编辑器自带基础主题（Tailwind 构建产物），随包发布为 ./style.css；
 * 若宿主有自己的 CSS 变量（--accent / --line …）可直接覆盖实现换肤。
 */
import './styles/editor.css'

export { DocEditorContext, useDocEditor } from './context.js'
export type { DocEditorContextValue } from './context.js'

export { DocEditorContent, ToolBar } from './Detached.js'
// 文档编辑器组件
export { DocEditor } from './DocEditor.js'

export type { DocEditorProps, DocEditorRef } from './DocEditor.js'

export { DocEditor as DocEditorProvider } from './DocEditor.js'
export { createDefaultExporters } from './export.js'
export {
  docxExporter,
  markdownExporter,
  pdfExporter,
  pngExporter,
} from './export.js'
export { reactRenderersPlugin } from './renderers.js'

export { createDocEditorSession } from './session.js'
export type { DocEditorSession } from './session.js'

export { Toolbar } from './Toolbar.js'

export type {
  AiAction,
  AiActionContext,
  AiActionResult,
  BlockRendererProps,
  DocEditorAi,
} from './types.js'
export { createAiActions, createAiAdapter } from '@sword-editor/doc-editor'

// TODO(sword-editor): 图片编辑器（ImageEditor）与无限画布编辑器（CanvasEditor）的 React 组件待实现，
// 届时在此导出，与 @sword-editor/image-editor / @sword-editor/canvas-editor 对接。
export type { AiAdapter, AiClientConfig } from '@sword-editor/doc-editor'
// 与组件使用同一份内置 SDK；使用者不必额外安装领域包。
export * from '@sword-editor/doc-editor'
export type { DocEditorPlugin as DocumentEditorPlugin } from '@sword-editor/doc-editor'
export { ImageEditor } from './ImageEditor.js'
