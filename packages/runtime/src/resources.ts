import type { Dispose } from './index.js'

export interface ScopedResources {
  add: (cleanup: Dispose) => Dispose
  timeout: (callback: () => unknown, delayMs: number) => Dispose
  interval: (callback: () => unknown, delayMs: number) => Dispose
  listen: (target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => Dispose
}
/** One tracked cleanup group; completed timers remove themselves instead of accumulating disposers. */
export function createScopedResources(signal: AbortSignal, track: (cleanup: Dispose) => Dispose, onError: (error: unknown) => void): ScopedResources {
  const entries = new Set<Dispose>()
  const active = () => {
    if (signal.aborted)
      throw new Error('Plugin resource scope is disposed')
  }
  const add = (cleanup: Dispose): Dispose => {
    active()
    let disposed = false
    const dispose = () => {
      if (disposed)
        return
      disposed = true
      entries.delete(dispose)
      const result: unknown = cleanup()
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        Promise.resolve(result).catch(() => {})
        throw new Error('Resource cleanup must be synchronous')
      }
    }
    entries.add(dispose)
    return dispose
  }
  const fail = (error: unknown) => {
    try {
      onError(error)
    }
    catch { /* Diagnostics cannot break callback isolation. */ }
  }
  const invoke = (callback: () => unknown) => {
    if (signal.aborted)
      return
    try {
      const result = callback()
      if (result && typeof (result as PromiseLike<unknown>).then === 'function')
        Promise.resolve(result).catch(fail)
    }
    catch (error) { fail(error) }
  }
  const delay = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 2147483647)
      throw new TypeError('Invalid timer delay')
  }
  track(() => {
    const errors: unknown[] = []
    for (const dispose of [...entries].reverse()) {
      try {
        dispose()
      }
      catch (error) { errors.push(error) }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Resource cleanup failed')
  })
  return Object.freeze({
    add,
    timeout(callback: () => unknown, delayMs: number) {
      active()
      delay(delayMs)
      const timer = setTimeout(() => {
        dispose()
        invoke(callback)
      }, delayMs)
      const dispose = add(() => clearTimeout(timer))
      return dispose
    },
    interval(callback: () => unknown, delayMs: number) {
      active()
      delay(delayMs)
      const timer = setInterval(invoke, delayMs, callback)
      return add(() => clearInterval(timer))
    },
    listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) {
      active()
      const wrapped: EventListener = event => invoke(() => listener.call(target, event))
      const capture = typeof options === 'boolean'
        ? options
        : options?.capture ?? false
      target.addEventListener(type, wrapped, options)
      return add(() => target.removeEventListener(type, wrapped, capture))
    },
  })
}
