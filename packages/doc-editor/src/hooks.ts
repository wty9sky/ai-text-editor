import type { Dispose, PluginManifest } from '@sword-editor/runtime'
import type { EditorDocument } from './document.js'
import { abortable, EventBus, immutableJson } from '@sword-editor/runtime'

export type Decision = { allow: true } | { allow: false, code: string, message?: string }
export type OperationOrigin = 'user' | 'plugin' | 'ai' | 'remote' | 'system'
export interface HookMeta {
  readonly sdkId: string
  readonly traceId: string
  readonly operationId: string
  readonly documentId: string
  readonly generation: number
  readonly origin: OperationOrigin
}
export interface HookOptions { priority?: number, failure?: 'required' | 'optional', timeoutMs?: number }
export interface Diagnostic {
  readonly timestamp: number
  readonly traceId: string
  readonly operationId: string
  readonly pluginId?: string
  readonly phase: string
  readonly durationMs: number
  readonly status: 'ok' | 'error' | 'denied' | 'cancelled'
  readonly code?: string
}
export class SdkError extends Error {
  readonly retryable: boolean
  readonly denied: boolean
  constructor(readonly code: string, message: string, readonly phase: string, readonly pluginId?: string, options?: { cause?: unknown, retryable?: boolean, denied?: boolean }) {
    super(message, { cause: options?.cause })
    this.name = 'SdkError'
    this.retryable = options?.retryable ?? false
    this.denied = options?.denied ?? false
  }
}
interface Base { readonly meta: HookMeta }
interface Spec<I, O, M extends string> { input: Readonly<I & Base>, output: O, mode: M }
type DecisionSpec<I = object> = Spec<I, Decision, 'decision'>
type Notice<I = object> = Spec<I, void, 'notification'>
interface PluginInfo { readonly plugin: Readonly<PluginManifest> }
interface TransactionInfo { readonly transactionId: string, readonly before: EditorDocument, readonly after: EditorDocument }
interface AiInfo { readonly actionId: string, readonly blockId?: string }
export interface HookMap {
  'sdk:beforeReady': Spec<object, void, 'sync'>
  'sdk:ready': Notice
  'sdk:beforeDestroy': Notice
  'sdk:destroyed': Notice<{ readonly cleanupFailed: boolean }>
  'plugin:beforeInstall': DecisionSpec<PluginInfo>
  'plugin:installed': Notice<PluginInfo>
  'plugin:installFailed': Notice<PluginInfo & { readonly code: string }>
  'plugin:beforeRemove': DecisionSpec<{ readonly pluginId: string }>
  'plugin:removed': Notice<{ readonly pluginId: string, readonly cleanupFailed: boolean }>
  'document:beforeLoad': DecisionSpec<{ readonly document: EditorDocument, readonly nextGeneration: number }>
  'document:loaded': Notice<{ readonly documentId: string, readonly generation: number }>
  'command:before': DecisionSpec<{ readonly commandId: string, readonly input: unknown, readonly revision: number }>
  'command:after': Notice<{ readonly commandId: string, readonly revision: number }>
  'command:error': Notice<{ readonly commandId: string, readonly code: string }>
  'transaction:beforeCommit': DecisionSpec<TransactionInfo>
  'transaction:committed': Notice<{ readonly transactionId: string, readonly revision: number }>
  'transaction:rolledBack': Notice<{ readonly transactionId: string, readonly code: string }>
  'selection:changed': Notice<{ readonly ids: readonly string[] }>
  'error:reported': Notice<{ readonly code: string }>
  'history:changed': Notice<{ readonly canUndo: boolean, readonly canRedo: boolean, readonly revision: number }>
  'ai:beforePrepare': DecisionSpec<AiInfo>
  'ai:prepareContext': Spec<AiInfo & { readonly context: Readonly<Record<string, unknown>>, readonly signal: AbortSignal }, Readonly<Record<string, unknown>>, 'transform'>
  'ai:beforeRun': DecisionSpec<AiInfo>
  'ai:progress': Notice<AiInfo & { readonly progress: number }>
  'ai:afterRun': Notice<AiInfo>
  'ai:beforeApply': DecisionSpec<AiInfo>
  'ai:applied': Notice<AiInfo>
  'ai:error': Notice<AiInfo & { readonly code: string }>
  'ai:cancelled': Notice<AiInfo>
}
export type HookName = keyof HookMap
export type HookHandler<K extends HookName> = (input: HookMap[K]['input']) => HookMap[K]['mode'] extends 'transform' ? Promise<HookMap[K]['output']> : HookMap[K]['output']
export interface HookRegistrar { on: <K extends HookName>(name: K, handler: HookHandler<K>, options?: HookOptions) => Dispose }
export type NotificationName = { [K in HookName]: HookMap[K]['mode'] extends 'notification' ? K : never }[HookName]
export type EditorEvents = { [K in NotificationName]: HookMap[K]['input'] }
const decisions = new Set<HookName>([
  'plugin:beforeInstall',
  'plugin:beforeRemove',
  'document:beforeLoad',
  'command:before',
  'transaction:beforeCommit',
  'ai:beforePrepare',
  'ai:beforeRun',
  'ai:beforeApply',
])
const syncHooks = new Set<HookName>(['sdk:beforeReady'])
const names = new Set<HookName>([
  ...decisions,
  ...syncHooks,
  'sdk:ready',
  'sdk:beforeDestroy',
  'sdk:destroyed',
  'plugin:installed',
  'plugin:installFailed',
  'plugin:removed',
  'document:loaded',
  'command:after',
  'command:error',
  'transaction:committed',
  'transaction:rolledBack',
  'history:changed',
  'selection:changed',
  'error:reported',
  'ai:prepareContext',
  'ai:progress',
  'ai:afterRun',
  'ai:applied',
  'ai:error',
  'ai:cancelled',
])
interface Entry { owner?: string, signal?: AbortSignal, active: boolean, priority: number, order: number, optional: boolean, timeoutMs?: number, handler: (input: never) => unknown }
const isPromise = (value: unknown): value is PromiseLike<unknown> => !!value && typeof (value as PromiseLike<unknown>).then === 'function'

/** Typed interception and notification; payloads are never retained in diagnostic records. */
export class HookDispatcher implements HookRegistrar {
  private entries = new Map<HookName, Entry[]>()
  private sorted = new Map<HookName, { revision: number, entries: Entry[] }>()
  private sequence = 0
  private depth = 0
  private closed = false
  private records: Diagnostic[] = []
  private bus = new EventBus<EditorEvents>((error, name, value) => {
    if (value)
      this.record(value.meta, `subscriber:${name}`, 'error', undefined, errorCode(error))
  })

  readonly events = Object.freeze({
    subscribe: this.bus.subscribe.bind(this.bus),
  })

  constructor(private rank: (pluginId?: string) => number, private ownerOrder: (pluginId?: string) => number = () => 0, private orderRevision: () => number = () => 0) {}
  has(name: HookName): boolean { return (this.entries.get(name) ?? []).some(entry => entry.active && !entry.signal?.aborted) }
  get isDispatching(): boolean { return this.depth > 0 }
  get diagnostics(): readonly Diagnostic[] { return Object.freeze([...this.records]) }
  record(meta: HookMeta, phase: string, status: Diagnostic['status'], pluginId?: string, code?: string, durationMs = 0): void {
    this.records.push(Object.freeze({
      timestamp: Date.now(),
      traceId: meta.traceId,
      operationId: meta.operationId,
      pluginId,
      phase,
      durationMs,
      status,
      code,
    }))
    if (this.records.length > 500)
      this.records.shift()
  }

  on<K extends HookName>(name: K, handler: HookHandler<K>, options: HookOptions = {}): Dispose {
    return this.register(undefined, undefined, name, handler, options)
  }

  scoped(owner: string, signal: AbortSignal, track: (cleanup: Dispose) => Dispose): HookRegistrar {
    return Object.freeze({
      on: <K extends HookName>(name: K, handler: HookHandler<K>, options?: HookOptions) => track(this.register(owner, signal, name, handler, options)),
    })
  }

  private register<K extends HookName>(owner: string | undefined, signal: AbortSignal | undefined, name: K, handler: HookHandler<K>, options: HookOptions = {}): Dispose {
    if (this.closed || signal?.aborted)
      throw new Error('Hook scope is disposed')
    if (!names.has(name) || typeof handler !== 'function')
      throw new TypeError(`Unknown hook: ${String(name)}`)
    if (options.priority !== undefined && !Number.isFinite(options.priority))
      throw new TypeError('Invalid hook priority')
    if (options.failure === 'optional' && name !== 'ai:prepareContext')
      throw new TypeError('Only async transforms may be optional')
    if (options.timeoutMs !== undefined && (name !== 'ai:prepareContext' || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 0 || options.timeoutMs > 2147483647))
      throw new TypeError('Timeouts are supported only for async preparation hooks')
    const entry: Entry = {
      owner,
      signal,
      active: true,
      priority: options.priority ?? 0,
      order: this.sequence++,
      optional: options.failure === 'optional',
      timeoutMs: options.timeoutMs,
      handler: handler as (input: never) => unknown,
    }
    const entries = this.entries.get(name) ?? []
    entries.push(entry)
    this.sorted.delete(name)
    this.entries.set(name, entries)
    return () => {
      if (!entry.active)
        return
      entry.active = false
      this.sorted.delete(name)
      const index = entries.indexOf(entry)
      if (index >= 0)
        entries.splice(index, 1)
      if (!entries.length)
        this.entries.delete(name)
    }
  }

  private snapshot(name: HookName, reverse = false): Entry[] {
    const revision = this.orderRevision()
    let cached = this.sorted.get(name)
    if (!cached || cached.revision !== revision) {
      const entries = [
        ...(this.entries.get(name) ?? []),
      ]
        .map(entry => ({
          entry,
          rank: this.rank(entry.owner),
          owner: this.ownerOrder(entry.owner),
        }))
        .sort((a, b) => a.rank - b.rank || b.entry.priority - a.entry.priority || a.owner - b.owner || a.entry.order - b.entry.order)
        .map(item => item.entry)
      cached = { revision, entries }
      this.sorted.set(name, cached)
    }
    return reverse
      ? [...cached.entries].reverse()
      : [...cached.entries]
  }

  dispatch<K extends Exclude<HookName, 'ai:prepareContext'>>(name: K, input: HookMap[K]['input'], reverse = false): void {
    const decision = decisions.has(name)
    const blocking = decision || syncHooks.has(name)
    const payload = Object.freeze(input)
    const startedDispatch = Date.now()
    let failed = false
    this.depth++
    try {
      for (const entry of this.snapshot(name, reverse)) {
        if (!entry.active || entry.signal?.aborted)
          continue
        const started = Date.now()
        try {
          const value = entry.handler(payload as never)
          if (isPromise(value)) {
            Promise.resolve(value).catch(() => {})
            throw new SdkError('HOOK_ASYNC_IN_SYNC', 'Synchronous hook returned a Promise', name, entry.owner)
          }
          if (decision) {
            if (!value || typeof value !== 'object' || typeof (value as Decision).allow !== 'boolean' || (!(value as Decision).allow && (typeof (value as { code?: unknown }).code !== 'string' || !(value as { code: string }).code.trim())))
              throw new SdkError('HOOK_INVALID_DECISION', 'Expected a Decision result', name, entry.owner)
            if (!(value as Decision).allow) {
              const denied = value as Extract<Decision, { allow: false }>
              throw new SdkError(denied.code, denied.message ?? 'Operation rejected by hook', name, entry.owner, { denied: true })
            }
          }
          else if (value !== undefined) {
            throw new SdkError('HOOK_INVALID_RESULT', 'Notification hooks must return void', name, entry.owner)
          }
          this.record(input.meta, name, 'ok', entry.owner, undefined, Date.now() - started)
        }
        catch (cause) {
          this.record(input.meta, name, cause instanceof SdkError && cause.denied
            ? 'denied'
            : 'error', entry.owner, errorCode(cause), Date.now() - started)
          if (blocking) {
            throw cause instanceof SdkError
              ? cause
              : new SdkError('HOOK_FAILED', 'Hook failed', name, entry.owner, { cause })
          }
        }
      }
      if (!blocking) {
        this.bus.publish(name as NotificationName, payload as EditorEvents[NotificationName])
      }
    }
    catch (error) {
      failed = true
      throw error
    }
    finally {
      this.depth--
      const cleanupFailed = (input as { cleanupFailed?: boolean }).cleanupFailed
      this.record(input.meta, name, failed || cleanupFailed
        ? 'error'
        : 'ok', undefined, cleanupFailed ? 'CLEANUP_FAILED' : undefined, Date.now() - startedDispatch)
    }
  }

  async transform(input: HookMap['ai:prepareContext']['input']): Promise<Readonly<Record<string, unknown>>> {
    let context = input.context
    for (const entry of this.snapshot('ai:prepareContext')) {
      input.signal.throwIfAborted()
      if (!entry.active || entry.signal?.aborted)
        continue
      const started = Date.now()
      try {
        const signal = AbortSignal.any([
          input.signal,
          ...(entry.signal
            ? [entry.signal]
            : []),
          ...(entry.timeoutMs !== undefined
            ? [
                AbortSignal.timeout(entry.timeoutMs),
              ]
            : []),
        ])
        let task: unknown
        this.depth++
        try {
          task = entry.handler(Object.freeze({
            ...input,
            context,
            signal,
          }) as never)
        }
        finally { this.depth-- }
        const output = await abortable(Promise.resolve(task), signal)
        input.signal.throwIfAborted()
        if (!entry.active || entry.signal?.aborted)
          throw new SdkError('HOOK_REMOVED', 'Hook was removed during preparation', 'ai:prepareContext', entry.owner)
        if (!output || Array.isArray(output) || typeof output !== 'object' || Object.getPrototypeOf(output) !== Object.prototype)
          throw new SdkError('HOOK_INVALID_RESULT', 'Context hook must return a plain namespaced patch', 'ai:prepareContext', entry.owner)
        // A plugin can only contribute its namespace; never override another contributor.
        context = Object.freeze({
          ...context,
          [entry.owner ?? 'host']: immutableJson({
            ...(context[entry.owner ?? 'host'] as Record<string, unknown> | undefined),
            ...output,
          }),
        })
        this.record(input.meta, 'ai:prepareContext', 'ok', entry.owner, undefined, Date.now() - started)
      }
      catch (cause) {
        this.record(input.meta, 'ai:prepareContext', input.signal.aborted ? 'cancelled' : 'error', entry.owner, errorCode(cause), Date.now() - started)
        input.signal.throwIfAborted()
        if (!entry.optional)
          throw cause
      }
    }
    input.signal.throwIfAborted()
    return context
  }

  close(): void {
    this.closed = true
    for (const entries of this.entries.values()) {
      for (const entry of entries) entry.active = false
    }
    this.entries.clear()
    this.sorted.clear()
    this.bus.close()
  }
}
export function errorCode(error: unknown): string {
  if (error instanceof SdkError)
    return error.code
  if (error instanceof Error && error.name === 'AbortError')
    return 'SDK_CANCELLED'
  if (error instanceof Error && error.name === 'TimeoutError')
    return 'SDK_TIMEOUT'
  return 'SDK_OPERATION_FAILED'
}
