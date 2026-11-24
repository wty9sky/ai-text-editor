import type { Dispose } from '@sword-editor/runtime'
import type { HookMeta } from './hooks.js'
import { EventBus, immutableJson } from '@sword-editor/runtime'
import { SdkError } from './hooks.js'

export interface MessageTopic<T> {
  readonly name: string
  readonly validate?: (value: unknown) => void
  /** Type-only payload marker; never evaluated at runtime. */
  readonly payloadType?: T
}
export function defineTopic<T>(name: string, validate?: (value: unknown) => void): MessageTopic<T> {
  if (!name.trim() || !name.includes(':') || /\s/.test(name))
    throw new TypeError('Message topics must use namespace:event names')
  return Object.freeze({ name, validate })
}
export interface MessageEnvelope<T> {
  readonly topic: string
  readonly source: string
  readonly sourceType: 'host' | 'plugin'
  readonly meta: HookMeta
  readonly data: T
}
export interface PluginMessages {
  publish: <T>(topic: MessageTopic<T>, data: T) => void
  subscribe: <T>(topic: MessageTopic<T>, listener: (message: MessageEnvelope<T>) => unknown) => Dispose
}
/** Custom plugin notifications are separate from core workflow events and cannot veto a commit. */
export class MessageHub {
  private bus: EventBus<Record<string, MessageEnvelope<unknown>>>
  private closed = false
  get isPublishing(): boolean { return this.bus.isPublishing }
  constructor(private meta: () => HookMeta, private report: (error: unknown, message?: MessageEnvelope<unknown>) => void) {
    this.bus = new EventBus((error, _name, message) => report(error, message))
  }

  scoped(source: string, signal?: AbortSignal, track: (dispose: Dispose) => Dispose = dispose => dispose): PluginMessages {
    const active = () => {
      if (this.closed || signal?.aborted)
        throw new SdkError('MESSAGE_SCOPE_DISPOSED', 'Message scope is disposed', 'message', source)
    }
    return Object.freeze({
      publish: <T>(topic: MessageTopic<T>, data: T) => {
        active()
        if (signal !== undefined && !topic.name.startsWith(`${source}:`))
          throw new SdkError('MESSAGE_NAMESPACE_DENIED', 'Plugins may publish only in their own namespace', 'message', source)
        this.validate(topic, data)
        const message = Object.freeze({
          topic: topic.name,
          source,
          sourceType: signal ? 'plugin' as const : 'host' as const,
          meta: this.meta(),
          data: immutableJson(data),
        })
        this.bus.publish(topic.name, message)
      },
      subscribe: <T>(topic: MessageTopic<T>, listener: (message: MessageEnvelope<T>) => unknown) => {
        active()
        return track(this.bus.subscribe(topic.name, (message) => {
          const failed = (cause: unknown): never => {
            throw new SdkError('MESSAGE_SUBSCRIBER_FAILED', 'Message subscriber failed', 'message', source, {
              cause,
            })
          }
          try {
            this.validate(topic, message.data)
            const result = listener(message as MessageEnvelope<T>)
            if (result && typeof (result as PromiseLike<unknown>).then === 'function')
              return Promise.resolve(result).catch(failed)
            return result
          }
          catch (cause) { return failed(cause) }
        }))
      },
    })
  }

  private validate<T>(topic: MessageTopic<T>, data: unknown): void {
    const result: unknown = topic.validate?.(data)
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      Promise.resolve(result).catch(() => {})
      throw new SdkError('MESSAGE_ASYNC_VALIDATOR', 'Message validation must be synchronous', 'message')
    }
  }

  close(): void {
    this.closed = true
    this.bus.close()
  }
}
