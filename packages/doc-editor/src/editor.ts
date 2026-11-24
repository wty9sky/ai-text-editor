import type { Dispose, LifecycleState } from '@sword-editor/runtime'
import type { EditorDocument } from './document.js'
import type { HookMeta, HookRegistrar, OperationOrigin } from './hooks.js'
import type { DocEditorPlugin } from './plugin.js'
import type { Block } from './types.js'
import { immutableJson } from '@sword-editor/runtime'
import { parseDocument, validateBlocks } from './document.js'
import { errorCode, HookDispatcher, SdkError } from './hooks.js'
import { newBlockId } from './markdown.js'
import { MessageHub } from './messages.js'
import { PluginManager } from './plugin-manager.js'

export type EditorEventType = 'change' | 'selection' | 'history' | 'plugins' | 'lifecycle' | 'error'
export type EditorListener = (event: EditorEventType, editor: Editor) => void
const TEXT_COALESCE_MS = 800
const MAX_HISTORY = 200
interface Snapshot {
  blocks: Block[]
  selection: string[]
}
export type PermissionCapability = 'document.read' | 'document.write' | 'asset.read' | 'ai.invoke'
export interface PermissionRequest { readonly capability: PermissionCapability, readonly pluginId?: string, readonly documentId: string }
export interface EditorOptions {
  plugins?: DocEditorPlugin[]
  document?: EditorDocument
  /** Register host hooks before initialization. */
  setup?: (hooks: HookRegistrar) => void
  /** Host capability gate, not a JavaScript isolation sandbox. Defaults to allow for compatibility. */
  authorize?: (request: PermissionRequest) => boolean
}
export class Editor {
  readonly sdkId = newBlockId()
  readonly hooks = new HookDispatcher(name => this.plugins?.rank(name) ?? 0, name => this.plugins?.order(name) ?? -1, () => this.plugins?.revision ?? 0)
  readonly events = this.hooks.events
  private messageHub = new MessageHub(() => this.createMeta('plugin'), (error, message) => {
    this.hooks.record(message?.meta ?? this.createMeta('plugin'), 'message:subscriber', 'error', error instanceof SdkError
      ? error.pluginId
      : message?.source, error instanceof SdkError
      ? error.code
      : 'MESSAGE_SUBSCRIBER_FAILED')
  })

  readonly messages = this.messageHub.scoped('host')
  messageScope(source: string, signal: AbortSignal, track: (cleanup: Dispose) => Dispose) { return this.messageHub.scoped(source, signal, track) }
  private operationMeta?: HookMeta
  private publishing = false
  private checkingPolicy = false
  private operationOwner?: string
  private permissionPolicy?: EditorOptions['authorize']
  get diagnostics() { return this.hooks.diagnostics }
  createMeta(origin: OperationOrigin = 'user'): HookMeta {
    return Object.freeze({
      sdkId: this.sdkId,
      traceId: newBlockId(),
      operationId: newBlockId(),
      documentId: this.documentId,
      generation: this.generation,
      origin,
    })
  }

  withOperation<T>(meta: HookMeta, action: () => T, owner?: string): T {
    const previous = this.operationMeta
    const previousOwner = this.operationOwner
    this.operationOwner = owner ?? previousOwner
    this.operationMeta = meta
    try {
      return action()
    }
    finally {
      this.operationMeta = previous
      this.operationOwner = previousOwner
    }
  }

  authorize(capability: PermissionCapability, pluginId?: string): void {
    if (!this.permissionPolicy)
      return
    if (this.checkingPolicy)
      throw new SdkError('PERMISSION_REENTRY', 'Permission policy cannot reenter SDK', capability, pluginId)
    pluginId ??= this.operationOwner
    let allowed: boolean
    this.checkingPolicy = true
    try {
      allowed = this.permissionPolicy(Object.freeze({
        capability,
        pluginId,
        documentId: this.documentId,
      }))
    }
    catch (cause) { throw new SdkError('PERMISSION_FAILED', 'Permission policy failed', capability, pluginId, { cause }) }
    finally { this.checkingPolicy = false }
    if (allowed !== true)
      throw new SdkError('PERMISSION_DENIED', 'Capability denied by host', capability, pluginId)
  }

  readonly plugins: PluginManager
  private _state: LifecycleState = 'initializing'
  private _blocks: Block[] = []
  private _selection: string[] = []
  private _undoStack: Snapshot[] = []
  private _redoStack: Snapshot[] = []
  private _listeners = new Set<EditorListener>()
  private _lastKey: string | null = null
  private _lastAt = 0
  private _transactionDepth = 0
  private _pending = new Set<EditorEventType>()
  private _documentId = newBlockId()
  private _generation = 0
  private _revision = 0
  private _envelope: Omit<EditorDocument, 'blocks'> = { format: 'site.block-document', version: 1, id: this._documentId }
  private _controller = new AbortController()
  private _errors: unknown[] = []
  constructor(options: EditorOptions = {}) {
    this.permissionPolicy = options.authorize
    this._blocks = validateBlocks([
      {
        id: newBlockId(),
        type: 'paragraph',
        text: '',
      },
    ])
    this.plugins = new PluginManager(this)
    try {
      options.setup?.(this.hooks)
      if (options.document)
        this.loadDocument(options.document)
      this.plugins.useAll(options.plugins ?? [])
      const meta = this.createMeta('system')
      this.hooks.dispatch('sdk:beforeReady', { meta })
      this._state = 'ready'
      this.hooks.dispatch('sdk:ready', { meta })
      this._emit('lifecycle')
    }
    catch (error) {
      try {
        this.destroy()
      }
      catch (cleanup) {
        throw new AggregateError([error, cleanup], 'Editor initialization failed')
      }
      throw error
    }
  }

  get state(): LifecycleState {
    return this._state
  }

  get signal(): AbortSignal {
    return this._controller.signal
  }

  get errors(): readonly unknown[] {
    return [...this._errors]
  }

  get documentId(): string {
    return this._documentId
  }

  get generation(): number {
    return this._generation
  }

  get revision(): number {
    return this._revision
  }

  get blocks(): readonly Block[] {
    return this._blocks
  }

  get selection(): readonly string[] {
    return Object.freeze([...this._selection])
  }

  get selectedBlocks(): Block[] {
    const ids = new Set(this._selection)
    return this._blocks.filter(b => ids.has(b.id))
  }

  get canUndo(): boolean {
    return this._undoStack.length > 0
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0
  }

  getBlock(id: string): Block | undefined {
    return this._blocks.find(b => b.id === id)
  }

  indexOf(id: string): number {
    return this._blocks.findIndex(b => b.id === id)
  }

  assertActive(): void {
    if (this.hooks.isDispatching || this.messageHub.isPublishing || this.publishing || this.checkingPolicy)
      throw new SdkError('REENTRANT_MUTATION', 'Cannot modify editor during hook/event dispatch', 'dispatch')
    if (this._state === 'destroying' || this._state === 'destroyed')
      throw new Error('Editor is destroyed')
  }

  private outsideTransaction(): void {
    this.assertActive()
    if (this._transactionDepth)
      throw new Error('Document load, history and destroy are not allowed inside a transaction')
  }

  private resetCoalescing(): void {
    this._lastKey = null
    this._lastAt = 0
  }

  private snapshot(): Snapshot {
    return {
      blocks: this._blocks,
      selection: [...this._selection],
    }
  }

  /** Load starts a new editing session, even if the document id is unchanged. */
  loadDocument(input: unknown): void {
    this.outsideTransaction()
    const document = parseDocument(input)
    const meta = this.operationMeta ?? this.createMeta('system')
    this.authorize('document.write')
    this.hooks.dispatch('document:beforeLoad', { meta, document, nextGeneration: this.generation + 1 })
    const { blocks, ...envelope } = document
    this._controller.abort()
    this._controller = new AbortController()
    this._envelope = envelope
    this._documentId = document.id
    this._generation++
    this._revision++
    this._blocks = blocks
    this._selection = []
    this._undoStack = []
    this._redoStack = []
    this.resetCoalescing()
    const loadedMeta = Object.freeze({ ...meta, documentId: this.documentId, generation: this.generation })
    this.hooks.dispatch('document:loaded', { meta: loadedMeta, documentId: this.documentId, generation: this.generation })
    this.withOperation(loadedMeta, () => {
      this._emit('change')
      this._emit('selection')
      this._emit('history')
    })
  }

  toDocument(): EditorDocument {
    return immutableJson({ ...this._envelope, blocks: this._blocks })
  }

  setBlocks(blocks: Block[]): void {
    this.loadDocument({
      format: 'site.block-document',
      version: 1,
      id: newBlockId(),
      blocks,
    })
  }

  select(ids: string[], additive = false): void {
    this.assertActive()
    const valid = ids.filter(id => this.getBlock(id))
    this._selection = [
      ...new Set([
        ...(additive
          ? this._selection
          : []),
        ...valid,
      ]),
    ]
    this.resetCoalescing()
    this._emit('selection')
  }

  toggleSelect(id: string): void {
    this.select(this._selection.includes(id)
      ? this._selection.filter(x => x !== id)
      : [...this._selection, id])
  }

  selectRange(fromId: string, toId: string, additive = false): void {
    this.assertActive()
    const a = this.indexOf(fromId)
    const b = this.indexOf(toId)
    if (a < 0 || b < 0)
      return
    this.select(this._blocks.slice(Math.min(a, b), Math.max(a, b) + 1).map(block => block.id), additive)
  }

  clearSelection(): void {
    this.select([])
  }

  private mutate(operation: () => Block[], key: string | null = null, selection?: () => string[]): void {
    this.assertActive()
    const before = this.snapshot()
    this.authorize('document.write')
    const next = validateBlocks(operation())
    if (JSON.stringify(next) === JSON.stringify(this._blocks))
      return
    const meta = this.operationMeta ?? this.createMeta()
    const transactionId = newBlockId()
    if (!this._transactionDepth) {
      try {
        this.hooks.dispatch('transaction:beforeCommit', {
          meta,
          transactionId,
          before: this.toDocument(),
          after: immutableJson({ ...this._envelope, blocks: next }),
        })
      }
      catch (error) {
        this.hooks.dispatch('transaction:rolledBack', {
          meta,
          transactionId,
          code: errorCode(error),
        })
        throw error
      }
    }
    this._blocks = next
    if (selection)
      this._selection = selection()
    this._selection = this._selection.filter(id => this.getBlock(id))
    this._revision++
    if (!this._transactionDepth) {
      const now = Date.now()
      if (!key || key !== this._lastKey || now - this._lastAt >= TEXT_COALESCE_MS) {
        this._undoStack.push(before)
        if (this._undoStack.length > MAX_HISTORY)
          this._undoStack.shift()
      }
      this._redoStack = []
      this._lastKey = key
      this._lastAt = now
    }
    if (!this._transactionDepth)
      this.hooks.dispatch('transaction:committed', { meta, transactionId, revision: this.revision })
    this.withOperation(meta, () => {
      this._emit('change')
      this._emit('selection')
      this._emit('history')
    })
  }

  insert(index: number, blocks: Block | Block[]): void {
    const list = Array.isArray(blocks)
      ? blocks
      : [blocks]
    if (!Number.isInteger(index))
      throw new TypeError('Insert index must be an integer')
    this.mutate(() => {
      const next = [...this._blocks]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, ...list)
      return next
    }, null, () => list.map(block => block.id))
  }

  update(id: string, patch: Partial<Block>): void {
    if (patch.id !== undefined && patch.id !== id)
      throw new Error('Block id cannot be changed')
    const key = Object.keys(patch).length === 1 && typeof patch.text === 'string'
      ? `text:${id}`
      : null
    this.mutate(() => this._blocks.map(block => block.id === id
      ? {
          ...block,
          ...patch,
        }
      : block), key)
  }

  remove(ids: string[]): void {
    const targets = new Set(ids)
    this.mutate(() => {
      const next = this._blocks.filter(block => !targets.has(block.id))
      return next.length
        ? next
        : [
            {
              id: newBlockId(),
              type: 'paragraph',
              text: '',
            },
          ]
    }, null, () => [])
  }

  move(ids: string[], delta: number): void {
    this.assertActive()
    if (delta !== -1 && delta !== 1)
      return
    const selected = new Set(ids)
    this.mutate(() => {
      const next = [...this._blocks]
      const order = Array.from({ length: next.length }, (_, i) => delta < 0
        ? i
        : next.length - i - 1)
      for (const i of order) {
        const target = i + delta
        if (target >= 0 && target < next.length && selected.has(next[i].id) && !selected.has(next[target].id))
          [next[i], next[target]] = [next[target], next[i]]
      }
      return next
    })
  }

  duplicate(ids: string[]): void {
    const targets = new Set(ids)
    const originals = this._blocks.filter(block => targets.has(block.id))
    const copies = originals.map(block => ({
      ...block,
      id: newBlockId(),
    }))
    this.insert(originals.length
      ? this.indexOf(originals.at(-1)!.id) + 1
      : this._blocks.length, copies)
  }

  convert(id: string, type: string): void {
    const def = this.plugins.getBlockType(type)
    this.update(id, {
      type,
      ...(def?.leaf
        ? { text: '' }
        : {}),
    })
  }

  /** Synchronous savepoint; nested failures roll back their own edits. */
  transaction<T>(callback: () => T): T {
    this.assertActive()
    const before = this.snapshot()
    const pending = new Set(this._pending)
    const meta = this.operationMeta ?? this.createMeta()
    const transactionId = newBlockId()
    const previousMeta = this.operationMeta
    this.operationMeta = meta
    this._transactionDepth++
    let result: T
    try {
      result = callback()
      if (result && typeof (result as {
        then?: unknown
      }).then === 'function') {
        Promise.resolve(result).catch(() => {})
        throw new Error('Transactions must be synchronous')
      }
      if (this._transactionDepth === 1 && JSON.stringify(before.blocks) !== JSON.stringify(this._blocks)) {
        this.hooks.dispatch('transaction:beforeCommit', {
          meta,
          transactionId,
          before: immutableJson({ ...this._envelope, blocks: before.blocks }),
          after: this.toDocument(),
        })
      }
    }
    catch (error) {
      this._blocks = before.blocks
      this._selection = before.selection
      this._pending = pending
      this._revision++ // invalidate work started against rolled-back state
      this._transactionDepth--
      this.resetCoalescing()
      this.operationMeta = previousMeta
      this.hooks.dispatch('transaction:rolledBack', {
        meta,
        transactionId,
        code: errorCode(error),
      })
      throw error
    }
    this.operationMeta = previousMeta
    this._transactionDepth--
    if (!this._transactionDepth) {
      if (JSON.stringify(before.blocks) !== JSON.stringify(this._blocks)) {
        this._undoStack.push(before)
        if (this._undoStack.length > MAX_HISTORY)
          this._undoStack.shift()
        this._redoStack = []
        this.hooks.dispatch('transaction:committed', { meta, transactionId, revision: this.revision })
      }
      this.resetCoalescing()
      const events = [...this._pending]
      this._pending.clear()
      this.withOperation(meta, () => {
        for (const event of events) this._emit(event)
      })
    }
    return result
  }

  undo(): void {
    this.restoreHistory(this._undoStack, this._redoStack)
  }

  redo(): void {
    this.restoreHistory(this._redoStack, this._undoStack)
  }

  private restoreHistory(source: Snapshot[], target: Snapshot[]): void {
    this.outsideTransaction()
    const snapshot = source.at(-1)
    if (!snapshot)
      return
    this.authorize('document.write')
    const meta = this.operationMeta ?? this.createMeta()
    const transactionId = newBlockId()
    try {
      this.hooks.dispatch('transaction:beforeCommit', {
        meta,
        transactionId,
        before: this.toDocument(),
        after: immutableJson({ ...this._envelope, blocks: snapshot.blocks }),
      })
    }
    catch (error) {
      this.hooks.dispatch('transaction:rolledBack', {
        meta,
        transactionId,
        code: errorCode(error),
      })
      throw error
    }
    this.resetCoalescing()
    source.pop()
    if (!snapshot)
      return
    target.push(this.snapshot())
    this._blocks = snapshot.blocks
    this._selection = snapshot.selection
    this._revision++
    this.hooks.dispatch('transaction:committed', { meta, transactionId, revision: this.revision })
    this.withOperation(meta, () => {
      this._emit('change')
      this._emit('selection')
      this._emit('history')
    })
  }

  execute(id: string, payload?: unknown): unknown {
    this.assertActive()
    const meta = this.operationMeta ?? this.createMeta('plugin')
    const owner = this.plugins.owner('command', id)
    const fail = (error: unknown) => {
      this.hooks.dispatch('command:error', {
        meta,
        commandId: id,
        code: errorCode(error),
      })
      this.hooks.record(meta, 'command', 'error', owner, errorCode(error))
    }
    try {
      const command = this.plugins.getCommand(id)
      if (!command)
        throw new SdkError('COMMAND_UNKNOWN', `Unknown command: ${id}`, 'command', owner)
      const validated: unknown = command.validate?.(payload)
      if (validated && typeof (validated as PromiseLike<unknown>).then === 'function') {
        Promise.resolve(validated).catch(() => {})
        throw new SdkError('COMMAND_ASYNC_VALIDATOR', 'Command validation must be synchronous', 'command', owner)
      }
      this.hooks.dispatch('command:before', {
        meta,
        commandId: id,
        input: payload,
        revision: this.revision,
      })
      const result = this.withOperation(meta, () => command.execute(this, payload), owner)
      const success = (value: unknown) => {
        this.hooks.dispatch('command:after', { meta, commandId: id, revision: this.revision })
        this.hooks.record(meta, 'command', 'ok', owner)
        return value
      }
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(result).then(success, (error) => {
          fail(error)
          throw error
        })
      }
      return success(result)
    }
    catch (error) {
      fail(error)
      throw error
    }
  }

  on(listener: EditorListener): () => void {
    this.assertActive()
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  notifyPluginsChanged(): void {
    this._emit('plugins')
  }

  reportError(error: unknown): void {
    this._errors.push(error)
    if (this._errors.length > 100)
      this._errors.shift()
    if (this.hooks.isDispatching || this.publishing || this.checkingPolicy)
      return
    this.hooks.dispatch('error:reported', {
      meta: this.operationMeta ?? this.createMeta('system'),
      code: errorCode(error),
    })
    this._emit('error')
  }

  private _emit(event: EditorEventType): void {
    if (this._transactionDepth) {
      this._pending.add(event)
      return
    }
    if (event === 'selection')
      this.hooks.dispatch('selection:changed', { meta: this.operationMeta ?? this.createMeta('system'), ids: this.selection })
    if (event === 'history') {
      this.hooks.dispatch('history:changed', {
        meta: this.operationMeta ?? this.createMeta('system'),
        canUndo: this.canUndo,
        canRedo: this.canRedo,
        revision: this.revision,
      })
    }
    const previousPublishing = this.publishing
    this.publishing = true
    try {
      for (const listener of [...this._listeners]) {
        try {
          listener(event, this)
        }
        catch (error) {
          this._errors.push(error)
          if (this._errors.length > 100)
            this._errors.shift()
        }
      }
    }
    finally { this.publishing = previousPublishing }
  }

  destroy(): void {
    if (this._state === 'destroying' || this._state === 'destroyed')
      return
    this.outsideTransaction()
    if (this.plugins.isChanging)
      throw new Error('Cannot destroy editor inside a plugin lifecycle hook')
    const meta = this.createMeta('system')
    this.hooks.dispatch('sdk:beforeDestroy', { meta }, true)
    this._state = 'destroying'
    this._emit('lifecycle')
    this._controller.abort()
    let cleanupFailed = false
    try {
      this.plugins.destroy()
    }
    catch (error) {
      cleanupFailed = true
      throw error
    }
    finally {
      this._undoStack = []
      this._redoStack = []
      this._selection = []
      this._state = 'destroyed'
      this.hooks.dispatch('sdk:destroyed', { meta, cleanupFailed })
      this._emit('lifecycle')
      this._listeners.clear()
      this.hooks.close()
      this.messageHub.close()
    }
  }
}
