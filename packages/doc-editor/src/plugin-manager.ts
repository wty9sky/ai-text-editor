import type { Editor } from './editor.js'
import type { AiAction, ContextMenuItem, Exporter, ToolbarItem, Uploader } from './extensions.js'
import type { DocEditorPlugin, BlockRenderer, EditorCommand, PluginContext } from './plugin.js'
import type { BlockTypeDef } from './types.js'
import { createScopedResources, dependencyName, immutableJson, PluginRuntime, resolvePlugins } from '@sword-editor/runtime'
import { SdkError } from './hooks.js'

export class PluginManager {
  private installing?: string
  private changing = false
  private runtime: PluginRuntime<PluginContext>
  constructor(private editor: Editor) {
    this.runtime = new PluginRuntime((scope) => {
      const owner = this.installing!
      return ({
        editor,
        hooks: editor.hooks.scoped(this.installing!, scope.signal, scope.onDispose),
        events: Object.freeze({
          subscribe: (name, listener) => {
            if (scope.signal.aborted)
              throw new Error('Plugin scope is disposed')
            return scope.onDispose(editor.events.subscribe(name, listener))
          },
        }) as Editor['events'],
        messages: editor.messageScope(this.installing!, scope.signal, scope.onDispose),
        resources: createScopedResources(scope.signal, scope.onDispose, (error) => {
          editor.hooks.record(editor.createMeta('plugin'), 'resource:callback', 'error', owner, error instanceof SdkError
            ? error.code
            : 'RESOURCE_CALLBACK_FAILED')
        }),
        signal: scope.signal,
        onDispose: scope.onDispose,
        registerBlockType: (value, options) => scope.register('block', value.type, value, options),
        registerToolbar: (value, options) => scope.register('toolbar', value.id, value, options),
        registerContextMenu: (value, options) => scope.register('menu', value.id, value, options),
        registerExporter: (value, options) => scope.register('exporter', value.id, value, options),
        registerUploader: (value, options) => scope.register('uploader', value.id, {
          ...value,
          upload: (file: File, config: import('./extensions.js').UploadOptions) => value.upload(file, {
            ...config,
            signal: AbortSignal.any([
              scope.signal,
              ...(config.signal
                ? [config.signal]
                : []),
            ]),
          }),
        }, options),
        registerAiAction: (value, options) => scope.register('ai', value.id, {
          ...value,
          run: (ctx: import('./extensions.js').AiActionContext) => value.run({
            ...ctx,
            signal: AbortSignal.any([
              scope.signal,
              ...(ctx.signal
                ? [ctx.signal]
                : []),
            ]),
          }),
        }, options),
        registerCommand: (value, options) => scope.register('command', value.id, value, options),
        registerRenderer: (value, options) => scope.register(`renderer:${value.framework}`, value.id, value, options),
      })
    }, () => editor.notifyPluginsChanged())
  }

  get revision(): number { return this.runtime.revision }

  private assertChange(): void {
    if (this.changing || this.editor.hooks.isDispatching)
      throw new Error('Plugin lifecycle operations cannot be reentered')
    this.editor.assertActive()
  }

  order(name?: string): number {
    return name
      ? this.list().findIndex(plugin => plugin.name === name)
      : -1
  }

  rank(name?: string): number {
    if (!name)
      return -1
    const seen = new Set<string>()
    const depth = (id: string): number => {
      if (seen.has(id))
        return 0
      seen.add(id)
      const plugin = this.list().find(item => item.name === id)
      const levels = (plugin?.requires ?? []).filter(item => this.has(dependencyName(item))).map(item => depth(dependencyName(item)) + 1)
      seen.delete(id)
      return Math.max(0, ...levels)
    }
    return depth(name)
  }

  owner(kind: string, id: string): string | undefined { return this.runtime.owner(kind, id) }

  use(plugin: DocEditorPlugin): this { return this.useAll([plugin]) }

  useAll(plugins: DocEditorPlugin[]): this {
    this.assertChange()
    let ordered: DocEditorPlugin[]
    try {
      ordered = resolvePlugins(plugins, this.list())
    }
    catch (cause) {
      this.editor.hooks.record(this.editor.createMeta('plugin'), 'plugin:preflight', 'error', undefined, 'PLUGIN_DEPENDENCY_INVALID')
      throw new SdkError('PLUGIN_DEPENDENCY_INVALID', cause instanceof Error
        ? cause.message
        : 'Invalid plugin graph', 'plugin:preflight', undefined, { cause })
    }
    this.changing = true
    try {
      for (const plugin of ordered) {
        const meta = this.editor.createMeta('plugin')
        const manifest = immutableJson({
          name: plugin.name,
          version: plugin.version,
          apiVersion: plugin.apiVersion,
          requires: plugin.requires,
        })
        try {
          this.editor.hooks.dispatch('plugin:beforeInstall', { meta, plugin: manifest })
          this.installing = plugin.name
          this.runtime.use(plugin)
          this.editor.hooks.dispatch('plugin:installed', { meta, plugin: manifest })
        }
        catch (error) {
          this.editor.hooks.dispatch('plugin:installFailed', { meta, plugin: manifest, code: 'PLUGIN_INSTALL_FAILED' })
          throw error
        }
        finally { this.installing = undefined }
      }
    }
    finally { this.changing = false }
    return this
  }

  remove(name: string): this {
    this.assertChange()
    if (!this.has(name))
      return this
    if (this.list().some(plugin => plugin.requires?.some(item => dependencyName(item) === name)))
      throw new Error(`Plugin ${name} is required by installed plugins`)
    this.changing = true
    const meta = this.editor.createMeta('plugin')
    let cleanupFailed = false
    try {
      this.editor.hooks.dispatch('plugin:beforeRemove', { meta, pluginId: name })
      try {
        this.runtime.remove(name)
      }
      catch (error) {
        cleanupFailed = true
        throw error
      }
      finally { this.editor.hooks.dispatch('plugin:removed', { meta, pluginId: name, cleanupFailed }) }
    }
    finally { this.changing = false }
    return this
  }

  has(name: string): boolean {
    return this.runtime.has(name)
  }

  list(): DocEditorPlugin[] {
    return this.runtime.list()
  }

  get isChanging(): boolean {
    return this.changing || this.runtime.isChanging
  }

  destroy(): void {
    this.changing = true
    try {
      this.runtime.destroy((pluginId, cleanupFailed) => {
        this.editor.hooks.dispatch('plugin:removed', {
          meta: this.editor.createMeta('system'),
          pluginId,
          cleanupFailed,
        })
      })
    }
    finally { this.changing = false }
  }

  signal(kind: string, id: string): AbortSignal | undefined {
    const owner = this.owner(kind, id)
    return owner
      ? this.runtime.signal(owner)
      : undefined
  }

  get blockTypes(): BlockTypeDef<any>[] {
    return this.runtime.values('block')
  }

  getBlockType(type: string): BlockTypeDef<any> | undefined {
    return this.runtime.get('block', type)
  }

  listInsertableBlocks(): BlockTypeDef<any>[] {
    return this.blockTypes.filter(def => def.insertable !== false)
  }

  get toolbar(): ToolbarItem[] {
    return this.runtime.values('toolbar')
  }

  get contextMenu(): ContextMenuItem[] {
    return this.runtime.values('menu')
  }

  listExporters(): Exporter[] {
    return this.runtime.values('exporter')
  }

  getExporter(id: string): Exporter | undefined {
    return this.runtime.get('exporter', id)
  }

  listUploaders(): Uploader[] {
    return this.runtime.values('uploader')
  }

  getUploader(id: string): Uploader | undefined {
    return this.runtime.get('uploader', id)
  }

  listAiActions(): AiAction[] {
    return this.runtime.values('ai')
  }

  getAiAction(id: string): AiAction | undefined {
    return this.runtime.get('ai', id)
  }

  getCommand(id: string): EditorCommand | undefined {
    return this.runtime.get('command', id)
  }

  getRenderer(framework: 'vue' | 'react', type: string): BlockRenderer | undefined {
    return this.runtime.get(`renderer:${framework}`, type)
  }
}
