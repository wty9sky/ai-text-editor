import type { LifecycleState, RuntimePlugin, RuntimeScope } from './index.js'
import { immutableJson, PluginRuntime } from './index.js'

export interface StateContext<T> extends RuntimeScope {
  editor: StateEditor<T>
  registerCommand: (id: string, execute: (payload: unknown) => unknown) => () => void
}
export type StatePlugin<T> = RuntimePlugin<StateContext<T>>
export type StateEvent = 'change' | 'history' | 'plugins' | 'lifecycle'
/** Shared lifecycle/transaction mechanics; each SDK owns and validates its document schema. */
export class StateEditor<T> {
  readonly plugins: PluginRuntime<StateContext<T>>
  private _state: LifecycleState = 'initializing'
  private _document: T
  private undoStack: T[] = []
  private redoStack: T[] = []
  private depth = 0
  private pending = new Set<StateEvent>()
  private listeners = new Set<(event: StateEvent) => void>()
  private controller = new AbortController()
  private _revision = 0
  private _generation = 0
  private observerErrors: unknown[] = []
  constructor(document: T, private validate: (input: unknown) => T, plugins: StatePlugin<T>[] = []) {
    this._document = immutableJson(validate(document))
    this.plugins = new PluginRuntime<StateContext<T>>(scope => ({
      ...scope,
      editor: this,
      registerCommand: (id, execute) => scope.register('command', id, execute),
    }), () => this.emit('plugins'))
    try {
      for (const plugin of plugins)
        this.plugins.use(plugin)
      this._state = 'ready'
      this.emit('lifecycle')
    }
    catch (error) {
      try {
        this.destroy()
      }
      catch (cleanup) {
        throw new AggregateError([error, cleanup], 'SDK initialization failed')
      }
      ;
      throw error
    }
  }

  get state(): LifecycleState {
    return this._state
  }

  get document(): T {
    return this._document
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  get revision(): number {
    return this._revision
  }

  get generation(): number {
    return this._generation
  }

  get errors(): readonly unknown[] {
    return [...this.observerErrors]
  }

  get historyPosition(): number {
    return this.undoStack.length
  }

  get historyLength(): number {
    return this.undoStack.length + this.redoStack.length + 1
  }

  get canUndo(): boolean {
    return !!this.undoStack.length
  }

  get canRedo(): boolean {
    return !!this.redoStack.length
  }

  assertActive(): void {
    if (this._state === 'destroyed' || this._state === 'destroying')
      throw new Error('SDK is destroyed')
  }

  private outsideTransaction(): void {
    this.assertActive()
    if (this.depth)
      throw new Error('Operation is not allowed inside transaction')
  }

  on(listener: (event: StateEvent) => void): () => void {
    this.assertActive()
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: StateEvent): void {
    if (this.depth) {
      this.pending.add(event)
      return
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      }
      catch (error) {
        this.observerErrors.push(error)
        if (this.observerErrors.length > 100)
          this.observerErrors.shift()
      }
    }
  }

  update(transform: (document: T) => T): void {
    this.assertActive()
    const next = immutableJson(this.validate(transform(this._document)))
    if (JSON.stringify(next) === JSON.stringify(this._document))
      return
    if (!this.depth) {
      this.undoStack.push(this._document)
      if (this.undoStack.length > 200)
        this.undoStack.shift()
      this.redoStack = []
    }
    this._document = next
    this._revision++
    this.emit('change')
    this.emit('history')
  }

  load(input: unknown): void {
    this.outsideTransaction()
    const document = immutableJson(this.validate(input))
    this.controller.abort()
    this.controller = new AbortController()
    this._document = document
    this.undoStack = []
    this.redoStack = []
    this._generation++
    this._revision++
    this.emit('change')
    this.emit('history')
  }

  transaction<R>(callback: () => R): R {
    this.assertActive()
    const before = this._document
    const pending = new Set(this.pending)
    this.depth++
    let result: R
    try {
      result = callback()
      if (result && typeof (result as {
        then?: unknown
      }).then === 'function') {
        throw new Error('Transactions must be synchronous')
      }
    }
    catch (error) {
      this._document = before
      this.pending = pending
      this.depth--
      this._revision++
      throw error
    }
    this.depth--
    if (!this.depth) {
      if (JSON.stringify(before) !== JSON.stringify(this._document)) {
        this.undoStack.push(before)
        if (this.undoStack.length > 200)
          this.undoStack.shift()
        this.redoStack = []
      }
      const events = [...this.pending]
      this.pending.clear()
      for (const event of events)
        this.emit(event)
    }
    return result
  }

  undo(): void {
    this.restore(this.undoStack, this.redoStack)
  }

  redo(): void {
    this.restore(this.redoStack, this.undoStack)
  }

  private restore(from: T[], to: T[]): void {
    this.outsideTransaction()
    const doc = from.pop()
    if (doc === undefined)
      return
    to.push(this._document)
    this._document = doc
    this._revision++
    this.emit('change')
    this.emit('history')
  }

  execute<R = unknown>(id: string, payload?: unknown): R {
    this.assertActive()
    const command = this.plugins.get<(payload: unknown) => R>('command', id)
    if (!command)
      throw new Error(`Unknown command: ${id}`)
    return command(payload)
  }

  destroy(): void {
    if (this._state === 'destroyed' || this._state === 'destroying')
      return
    this.outsideTransaction()
    if (this.plugins.isChanging)
      throw new Error('Cannot destroy SDK inside a plugin lifecycle hook')
    this._state = 'destroying'
    this.emit('lifecycle')
    this.controller.abort()
    try {
      this.plugins.destroy()
    }
    finally {
      this.undoStack = []
      this.redoStack = []
      this._state = 'destroyed'
      this.emit('lifecycle')
      this.listeners.clear()
    }
  }
}
