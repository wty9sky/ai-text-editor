import type { App } from 'vue'
import ContextMenu from './ContextMenu.vue'
import DocEditor from './DocEditor.vue'
import EditorCanvas from './EditorCanvas.vue'
import Toolbar from './Toolbar.vue'
import Dropdown from './ui/Dropdown.vue'
import DropdownItem from './ui/DropdownItem.vue'
import './styles/editor.css'

// 文档编辑器组件
export { ContextMenu, DocEditor, Dropdown, DropdownItem, EditorCanvas, Toolbar }
export { EditorContextKey, EditorKey } from './context.js'

export type { DocEditorContext } from './context.js'

export { default as DocEditorContent } from './DetachedContent.vue'

export { default as ToolBar } from './DetachedToolbar.vue'
export {
  createDefaultExporters,
  docxExporter,
  markdownExporter,
  markdownToHtml,
  pdfExporter,
  pngExporter,
} from './export.js'

/** 全局注册插件：`app.use(DocEditorPlugin)` 后可在模板里直接用 `<DocEditor>` */
export const DocEditorPlugin = {
  install(app: App) {
    app.component('DocEditor', DocEditor)
  },
}

export default DocEditorPlugin

export { ICONS, resolveIcon } from './icons.js'

export { vueRenderersPlugin } from './renderers.js'
export { createDocEditorSession } from './session.js'

export type { DocEditorSession } from './session.js'
export type { AiAction, AiActionContext, AiActionResult, BlockRendererProps, DocEditorAi } from './types.js'

export { DocEditor as DocEditorProvider }
export { createAiActions, createAiAdapter } from '@sword-editor/doc-editor'
// TODO(sword-editor): 图片编辑器（ImageEditor）与无限画布编辑器（CanvasEditor）的 Vue 组件待实现，
// 届时在此导出，与 @sword-editor/image-editor / @sword-editor/canvas-editor 对接。
export type { AiAdapter, AiClientConfig } from '@sword-editor/doc-editor'
// 与组件使用同一份内置 SDK；使用者不必额外安装领域包。
export * from '@sword-editor/doc-editor'
export type { DocEditorPlugin as DocumentEditorPlugin } from '@sword-editor/doc-editor'
export { default as ImageEditor } from './ImageEditor.vue'
