import type { PluginManifest } from './dependencies.js'
import { dependencyName, resolvePlugins } from './dependencies.js'
/** Framework-independent plugin ownership, registration and disposal. */
export type Dispose = () => void
export type LifecycleState = 'initializing' | 'ready' | 'destroying' | 'destroyed'
export interface RegistrationOptions {
  override?: boolean
}
export interface RuntimeScope {
  readonly signal: AbortSignal
  onDispose: (cleanup: Dispose) => Dispose
  register: <T>(kind: string, id: string, value: T, options?: RegistrationOptions) => Dispose
}
export interface RuntimePlugin<C> extends PluginManifest {
  install: (context: C) => void | Dispose
  uninstall?: (context: C) => void
}
interface Entry {
  owner: string
  value: unknown
}
interface Installed<C> {
  plugin: RuntimePlugin<C>
  context: C
  controller: AbortController
  cleanups: Dispose[]
  removing: boolean
}
export class PluginRuntime<C> {
  private entries = new Map<string, Map<string, Entry[]>>()
  private installed = new Map<string, Installed<C>>()
  private destroyed = false
  private destroying = false
  private batchDepth = 0
  private dirty = false
  private _revision = 0
  get isChanging(): boolean {
    return this.batchDepth > 0
  }

  get revision(): number {
    return this._revision
  }

  private observerErrors: unknown[] = []
  get errors(): readonly unknown[] {
    return [...this.observerErrors]
  }

  private notify(): void {
    this._revision++
    if (this.batchDepth) {
      this.dirty = true
      return
    }
    try {
      this.changed()
    }
    catch (error) {
      this.observerErrors.push(error)
      if (this.observerErrors.length > 100)
        this.observerErrors.shift()
    }
  }

  private batch<R>(operation: () => R): R {
    if (this.batchDepth)
      throw new Error('Plugin lifecycle operations cannot be reentered')
    this.batchDepth++
    try {
      return operation()
    }
    finally {
      this.batchDepth--
      if (this.dirty) {
        this.dirty = false
        this.notify()
      }
    }
  }

  constructor(private context: (scope: RuntimeScope) => C, private changed: () => void = () => {
  }) {
  }

  get<T>(kind: string, id: string): T | undefined {
    return this.entries.get(kind)?.get(id)?.at(-1)?.value as T | undefined
  }

  owner(kind: string, id: string): string | undefined {
    return this.entries.get(kind)?.get(id)?.at(-1)?.owner
  }

  values<T>(kind: string): T[] {
    return [
      ...(this.entries.get(kind)?.values() ?? []),
    ].map(stack => stack.at(-1)!.value as T)
  }

  signal(name: string): AbortSignal | undefined { return this.installed.get(name)?.controller.signal }

  has(name: string): boolean {
    return this.installed.has(name)
  }

  list(): RuntimePlugin<C>[] {
    return [
      ...this.installed.values(),
    ].map(item => item.plugin)
  }

  use(plugin: RuntimePlugin<C>): this {
    return this.batch(() => this.install(plugin))
  }

  private install(plugin: RuntimePlugin<C>): this {
    if (this.destroyed || this.destroying)
      throw new Error('Plugin runtime is destroyed')
    if (!plugin.name.trim())
      throw new Error('Plugin name is required')
    if (this.has(plugin.name))
      return this
    resolvePlugins([plugin], this.list())
    const controller = new AbortController()
    const cleanups: Dispose[] = []
    let accepting = true
    const track = (cleanup: Dispose): Dispose => {
      if (!accepting || controller.signal.aborted)
        throw new Error(`Plugin scope is disposed: ${plugin.name}`)
      let disposed = false
      const once = () => {
        if (!disposed) {
          disposed = true
          const result: unknown = cleanup()
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            Promise.resolve(result).catch(() => {})
            throw new Error('Plugin cleanup must be synchronous')
          }
        }
      }
      cleanups.push(once)
      return once
    }
    const scope: RuntimeScope = {
      signal: controller.signal,
      onDispose: track,
      register: (kind, id, value, options) => {
        if (!accepting || controller.signal.aborted)
          throw new Error(`Plugin scope is disposed: ${plugin.name}`)
        if (!id.trim())
          throw new Error('Registration id is required')
        let registry = this.entries.get(kind)
        if (!registry) {
          registry = new Map()
          this.entries.set(kind, registry)
        }
        const stack = registry.get(id) ?? []
        if (stack.length && !options?.override)
          throw new Error(`Duplicate registration: ${kind}/${id}`)
        const entry = { value, owner: plugin.name }
        stack.push(entry)
        registry.set(id, stack)
        const dispose = track(() => {
          const index = stack.indexOf(entry)
          if (index >= 0)
            stack.splice(index, 1)
          if (!stack.length)
            registry!.delete(id)
          this.notify()
        })
        this.notify()
        return dispose
      },
    }
    const context = this.context(scope)
    const record = {
      plugin,
      context,
      controller,
      cleanups,
      removing: false,
    }
    this.installed.set(plugin.name, record)
    try {
      const cleanup: unknown = plugin.install(context)
      if (typeof cleanup === 'function') {
        track(cleanup as Dispose)
      }
      else if (cleanup && typeof (cleanup as {
        then?: unknown
      }).then === 'function') {
        Promise.resolve(cleanup).catch(() => {})
        throw new Error('Plugin installation must be synchronous')
      }
    }
    catch (error) {
      accepting = false
      controller.abort()
      const errors: unknown[] = [error]
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup()
        }
        catch (failure) {
          errors.push(failure)
        }
      }
      this.installed.delete(plugin.name)
      this.notify()
      throw errors.length === 1
        ? error
        : new AggregateError(errors, 'Plugin installation failed')
    }
    this.notify()
    return this
  }

  remove(name: string): this {
    return this.batch(() => this.uninstall(name))
  }

  private uninstall(name: string): this {
    const record = this.installed.get(name)
    if (!record || record.removing)
      return this
    if (!this.destroying) {
      const dependents = this.list().filter(plugin => plugin.requires?.some(dependency => dependencyName(dependency) === name))
      if (dependents.length)
        throw new Error(`Plugin ${name} is required by ${dependents.map(p => p.name).join(', ')}`)
    }
    record.removing = true
    record.controller.abort()
    const errors: unknown[] = []
    try {
      const result: unknown = record.plugin.uninstall?.(record.context)
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        Promise.resolve(result).catch(() => {})
        throw new Error('Plugin uninstall must be synchronous')
      }
    }
    catch (error) {
      errors.push(error)
    }
    for (const cleanup of record.cleanups.reverse()) {
      try {
        cleanup()
      }
      catch (error) {
        errors.push(error)
      }
    }
    this.installed.delete(name)
    this.notify()
    if (errors.length)
      throw new AggregateError(errors, `Plugin cleanup failed: ${name}`)
    return this
  }

  destroy(onRemove?: (name: string, failed: boolean) => void): void {
    if (this.destroyed || this.destroying)
      return
    if (this.batchDepth)
      throw new Error('Plugin lifecycle operations cannot be reentered')
    this.destroying = true
    const errors: unknown[] = []
    for (const name of [
      ...this.installed.keys(),
    ].reverse()) {
      let failed = false
      try {
        this.remove(name)
      }
      catch (error) {
        failed = true
        errors.push(error)
      }
      try {
        onRemove?.(name, failed)
      }
      catch (error) { errors.push(error) }
    }
    this.entries.clear()
    this.destroyed = true
    this.destroying = false
    if (errors.length)
      throw new AggregateError(errors, 'Plugin runtime cleanup failed')
  }
}
const immutableValues = new WeakSet<object>()
/** Clone and freeze JSON data; reject values that cannot survive serialization. */
export function immutableJson<T>(value: T): T {
  const ancestors = new Set<object>()
  const clone = (input: unknown): unknown => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean')
      return input
    if (typeof input === 'number' && Number.isFinite(input))
      return input
    if (typeof input !== 'object' || input === null)
      throw new Error('Expected JSON-compatible data')
    if (immutableValues.has(input))
      return input
    if (ancestors.has(input))
      throw new Error('Cyclic JSON data')
    ancestors.add(input)
    let result: unknown
    if (Array.isArray(input)) {
      result = Object.freeze(input.map(clone))
    }
    else {
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
        throw new Error('Expected a plain JSON object')
      result = Object.freeze(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined).map(([key, v]) => [
        key,
        clone(v),
      ])))
    }
    ancestors.delete(input)
    immutableValues.add(result as object)
    return result
  }
  return clone(value) as T
}
export { dependencyName, resolvePlugins, RUNTIME_API_VERSION } from './dependencies.js'
export type { PluginDependency, PluginManifest } from './dependencies.js'

export { EventBus } from './events.js'
export { createScopedResources } from './resources.js'
export type { ScopedResources } from './resources.js'

export { StateEditor } from './state-editor.js'

export type { StateContext, StateEvent, StatePlugin } from './state-editor.js'
export { abortable } from './tasks.js'
