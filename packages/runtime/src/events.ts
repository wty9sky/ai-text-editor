import type { Dispose } from './index.js'

/** Synchronous, snapshot-based publication. Reentrant publications are queued FIFO. */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<{ active: boolean, listener: (value: never) => unknown }>>()
  private queue: { name: keyof Events, value: Events[keyof Events] }[] = []
  private publishing = false
  get isPublishing(): boolean { return this.publishing }
  private closed = false
  constructor(private onError: (error: unknown, name?: keyof Events, value?: Events[keyof Events]) => void = () => {}) {}

  subscribe<K extends keyof Events>(name: K, listener: (value: Events[K]) => unknown): Dispose {
    if (this.closed)
      throw new Error('Event bus is closed')
    const entries = this.listeners.get(name) ?? new Set()
    this.listeners.set(name, entries)
    const entry = { active: true, listener: listener as (value: never) => unknown }
    entries.add(entry)
    return () => {
      if (!entry.active)
        return
      entry.active = false
      entries.delete(entry)
      if (!entries.size)
        this.listeners.delete(name)
    }
  }

  publish<K extends keyof Events>(name: K, value: Events[K]): void {
    if (this.closed)
      return
    this.queue.push({ name, value })
    if (this.publishing)
      return
    this.publishing = true
    try {
      let delivered = 0
      while (this.queue.length) {
        if (++delivered > 1000) {
          this.queue.length = 0
          this.fail(new Error('Event publication loop exceeded 1000 messages'))
          break
        }
        const message = this.queue.shift()!
        for (const entry of [
          ...(this.listeners.get(message.name) ?? []),
        ]) {
          if (!entry.active || this.closed)
            continue
          try {
            const result = entry.listener(message.value as never)
            if (result && typeof (result as PromiseLike<unknown>).then === 'function')
              Promise.resolve(result).catch(error => this.fail(error, message.name, message.value))
          }
          catch (error) { this.fail(error, message.name, message.value) }
        }
      }
    }
    finally { this.publishing = false }
  }

  private fail(error: unknown, name?: keyof Events, value?: Events[keyof Events]): void {
    try {
      this.onError(error, name, value)
    }
    catch { /* Error observers cannot break publication. */ }
  }

  close(): void {
    this.closed = true
    this.queue.length = 0
    for (const entries of this.listeners.values()) {
      for (const entry of entries) entry.active = false
    }
    this.listeners.clear()
  }
}
