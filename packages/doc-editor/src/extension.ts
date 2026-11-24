import type { Dispose, PluginManifest, ScopedResources } from '@sword-editor/runtime'
import type { EditorDocument } from './document.js'
import type { Editor } from './editor.js'
import type { HookRegistrar } from './hooks.js'
import type { PluginMessages } from './messages.js'
import type { DocEditorPlugin, PluginContext } from './plugin.js'
import type { Block } from './types.js'

export interface ExtensionCommand {
  id: string
  validate?: (payload: unknown) => void
  execute: (sdk: ExtensionApi, payload: unknown) => unknown
}

/** Restricted convenience facade. No raw editor, plugin manager or internal fields. Not an isolation sandbox. */
export interface ExtensionApi {
  readonly signal: AbortSignal
  readonly hooks: HookRegistrar
  readonly events: Editor['events']
  readonly messages: PluginMessages
  readonly resources: ScopedResources
  readonly document: Readonly<{
    snapshot: () => EditorDocument
    update: (id: string, patch: Partial<Block>) => void
    insert: (index: number, block: Block | Block[]) => void
    remove: (ids: string[]) => void
    transaction: <T>(action: () => T) => T
  }>
  readonly commands: Readonly<{ register: (command: ExtensionCommand) => Dispose, execute: (id: string, payload?: unknown) => unknown }>
}
export interface EditorExtension extends PluginManifest {
  version: string
  apply: (sdk: ExtensionApi) => void | Dispose
  dispose?: () => void
}
function facade(ctx: PluginContext, owner: string): ExtensionApi {
  const active = () => {
    if (ctx.signal.aborted)
      throw new Error('Extension scope is disposed')
    ctx.editor.assertActive()
  }
  const write = <T>(callback: () => T) => {
    active()
    return ctx.editor.withOperation(ctx.editor.createMeta('plugin'), callback, owner)
  }
  const api: ExtensionApi = Object.freeze({
    signal: ctx.signal,
    hooks: ctx.hooks,
    events: ctx.events,
    messages: ctx.messages,
    resources: ctx.resources,
    document: Object.freeze({
      snapshot: () => {
        if (ctx.signal.aborted)
          throw new Error('Extension scope is disposed')
        ctx.editor.authorize('document.read', owner)
        return ctx.editor.toDocument()
      },
      update: (id: string, patch: Partial<Block>) => write(() => ctx.editor.update(id, patch)),
      insert: (index: number, block: Block | Block[]) => write(() => ctx.editor.insert(index, block)),
      remove: (ids: string[]) => write(() => ctx.editor.remove(ids)),
      transaction: <T>(action: () => T) => write(() => ctx.editor.transaction(action)),
    }),
    commands: Object.freeze({
      register: (command: ExtensionCommand) => {
        active()
        const { id, validate, execute } = command
        return ctx.registerCommand({
          id,
          validate,
          execute: (_editor, payload) => execute(api, payload),
        })
      },
      execute: (id: string, payload?: unknown) => write(() => {
        ctx.editor.authorize('document.write', owner)
        return ctx.editor.execute(id, payload)
      }),
    }),
  })
  return api
}
/** Adapt apply/dispose to the stable install/uninstall contract; never expose the raw SDK object. */
export function defineExtension(extension: EditorExtension): DocEditorPlugin {
  if (typeof extension.version !== 'string' || !extension.version)
    throw new TypeError('Extensions must declare a version')
  if (typeof extension.apply !== 'function' || (extension.dispose !== undefined && typeof extension.dispose !== 'function'))
    throw new TypeError('Invalid extension lifecycle')
  const { apply, dispose } = extension
  return {
    name: extension.name,
    version: extension.version,
    apiVersion: extension.apiVersion,
    requires: extension.requires,
    install(ctx) {
      // Track before apply so partial initialization still runs dispose during rollback.
      if (dispose)
        ctx.onDispose(() => dispose.call(extension))
      return apply.call(extension, facade(ctx, extension.name))
    },
  }
}
