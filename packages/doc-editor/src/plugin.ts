/**
 * 插件基类与插件上下文
 *
 * 插件是编辑器功能的最小打包单元：一个插件在 install 时通过 PluginContext
 * 向各扩展点挂载能力（块类型 / 工具栏 / 右键菜单 / 导出器 / 上传器）。
 * 所有能力都以「块」为单位展开操作。
 */
import type { Dispose, PluginManifest, RegistrationOptions, ScopedResources } from '@sword-editor/runtime'
import type { Editor } from './editor.js'
import type { AiAction, ContextMenuItem, Exporter, ToolbarItem, Uploader } from './extensions.js'
import type { HookRegistrar } from './hooks.js'
import type { PluginMessages } from './messages.js'
import type { BlockTypeDef } from './types.js'
/** 插件上下文：install / uninstall 时传给插件，供其注册扩展 */
export interface PluginContext {
  /** 当前编辑器实例（可订阅事件、读块、做操作） */
  editor: Editor
  readonly hooks: HookRegistrar
  readonly events: Editor['events']
  readonly messages: PluginMessages
  readonly resources: ScopedResources
  readonly signal: AbortSignal
  onDispose: (cleanup: Dispose) => Dispose
  registerCommand: (command: EditorCommand, options?: RegistrationOptions) => Dispose
  registerRenderer: (renderer: BlockRenderer, options?: RegistrationOptions) => Dispose
  /** 注册一个块类型 */
  registerBlockType: (def: BlockTypeDef, options?: RegistrationOptions) => Dispose
  /** 注册一个工具栏项 */
  registerToolbar: (item: ToolbarItem, options?: RegistrationOptions) => Dispose
  /** 注册一个右键菜单项 */
  registerContextMenu: (item: ContextMenuItem, options?: RegistrationOptions) => Dispose
  /** 注册一个导出器 */
  registerExporter: (exporter: Exporter, options?: RegistrationOptions) => Dispose
  /** 注册一个上传器 */
  registerUploader: (uploader: Uploader, options?: RegistrationOptions) => Dispose
  /** 注册一个 AI 操作 */
  registerAiAction: (action: AiAction, options?: RegistrationOptions) => Dispose
}
/** 插件接口：实现它即可被 PluginManager 装载 */
export interface DocEditorPlugin extends PluginManifest {
  install: (ctx: PluginContext) => void | Dispose
  uninstall?: (ctx: PluginContext) => void
}
/** 便捷工厂：把一个对象字面量标注为插件（主要是类型提示） */
export function definePlugin(plugin: DocEditorPlugin): DocEditorPlugin {
  return plugin
}
export interface EditorCommand {
  id: string
  validate?: (payload: unknown) => void
  execute: (editor: Editor, payload: unknown) => unknown
}
/** View components remain opaque to the framework-independent engine. */
export interface BlockRenderer {
  id: string
  framework: 'vue' | 'react'
  component: unknown
}
