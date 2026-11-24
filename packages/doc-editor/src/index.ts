export { createAiActions, createAiAdapter } from './ai.js'
export type { AiClientConfig } from './ai.js'
export { BUILTIN_BLOCK_TYPES, coreBlocksPlugin, coreOpsPlugin, DEFAULT_PLUGINS } from './builtin.js'
export { parseDocument, syncDocument } from './document.js'
export type { EditorDocument } from './document.js'
export { Editor } from './editor.js'
export type { EditorEventType, EditorListener } from './editor.js'
export type { EditorOptions, PermissionCapability, PermissionRequest } from './editor.js'
export {
  createDefaultExporters,
  docxExporter,
  markdownExporter,
  pdfExporter,
  pngExporter,
} from './exporters.js'
export { defineExtension } from './extension.js'
export type { EditorExtension, ExtensionApi, ExtensionCommand } from './extension.js'
export type { AiAction, AiActionContext, AiActionResult, AiAdapter, ContextMenuItem, EditorActionContext, ExportContext, Exporter, ToolbarActionContext, ToolbarItem, Uploader, UploadKind, UploadOptions, UploadResult } from './extensions.js'
export { createFeaturePlugins } from './features.js'
export { HookDispatcher, SdkError } from './hooks.js'
export type { Decision, Diagnostic, EditorEvents, HookHandler, HookMap, HookMeta, HookName, HookOptions, HookRegistrar, NotificationName, OperationOrigin } from './hooks.js'
export { blocksToMarkdown, createBlock, markdownToBlocks, newBlockId, textToBlocks } from './markdown.js'
export { defineTopic } from './messages.js'
export type { MessageEnvelope, MessageTopic, PluginMessages } from './messages.js'
export { AiSession, applyAiResult, assertTarget, captureTarget, uploadFile, uploadKind } from './operations.js'
export type { OperationTarget } from './operations.js'
export { PluginManager } from './plugin-manager.js'
export type { DocEditorPlugin, PluginContext } from './plugin.js'

export { definePlugin } from './plugin.js'

export type { BlockRenderer, EditorCommand } from './plugin.js'
export { markdownToHtml, parseBlocks, parseInline } from './render.js'
export type { InlineSeg, MdBlock } from './render.js'
export { formatText, getTextStyle, parseTextStyle, TEXT_BLOCK_TYPES } from './text-style.js'

export type { FormatTextPayload, TextStyle } from './text-style.js'
/**
 * @sword-editor/doc-editor —— 块编辑器核心 SDK（框架无关）
 *
 * 以「块」为唯一操作单位，通过插件体系扩展所有能力：
 * - 数据模型：Block / BlockTypeDef；
 * - 插件体系：DocEditorPlugin / PluginContext / PluginManager；
 * - 编辑器引擎：Editor（块操作 / 多选 / undo-redo / 事件）；
 * - 扩展点：工具栏项 / 右键菜单项 / 导出器 / 上传器；
 * - 转换：Markdown ↔ 块 双向转换；
 * - 上传工厂：函数上传（OSS）/ action 上传。
 *
 * 不含任何 UI，可在浏览器 / Node / 任意前端框架里独立使用。
 */
export type { Block, BlockParseResult, BlockTypeDef, SerializeContext } from './types.js'
export { createActionUploader, createFunctionUploader } from './upload.js'
export type { ActionUploaderConfig, FunctionUploaderConfig } from './upload.js'

export type { Dispose, LifecycleState, RegistrationOptions } from '@sword-editor/runtime'
export type { PluginDependency, PluginManifest } from '@sword-editor/runtime'
