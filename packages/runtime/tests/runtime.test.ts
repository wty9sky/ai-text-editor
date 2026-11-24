import type { RuntimeScope } from '../src/index.js'
import { describe, expect, it, vi } from 'vitest'
import { immutableJson, PluginRuntime } from '../src/index.js'

describe('plugin runtime', () => {
  it('rolls back failed install and permits retry', () => {
    const runtime = new PluginRuntime<RuntimeScope>(scope => scope)
    const cleanup = vi.fn()
    expect(() => runtime.use({
      name: 'bad',
      install(ctx) {
        ctx.register('x', 'a', 1)
        ctx.onDispose(cleanup)
        throw new Error('bad')
      },
    })).toThrow('bad')
    expect(runtime.has('bad')).toBe(false)
    expect(runtime.values('x')).toEqual([])
    expect(cleanup).toHaveBeenCalledOnce()
    runtime.use({
      name: 'bad',
      install(ctx) {
        ctx.register('x', 'a', 2)
      },
    })
    expect(runtime.get('x', 'a')).toBe(2)
  })
  it('rejects conflicts; explicit override restores previous registration on disposal', () => {
    const runtime = new PluginRuntime<RuntimeScope>(scope => scope)
    runtime.use({
      name: 'a',
      install(ctx) {
        ctx.register('x', 'id', 'a')
      },
    })
    expect(() => runtime.use({
      name: 'b',
      install(ctx) {
        ctx.register('x', 'id', 'b')
      },
    })).toThrow('Duplicate')
    runtime.use({
      name: 'b',
      install(ctx) {
        ctx.register('x', 'id', 'b', { override: true })
      },
    })
    runtime.remove('b')
    expect(runtime.get('x', 'id')).toBe('a')
    runtime.use({
      name: 'b',
      install(ctx) {
        ctx.register('x', 'id', 'b', { override: true })
      },
    })
    runtime.remove('a')
    expect(runtime.get('x', 'id')).toBe('b')
  })
  it('completes teardown despite errors and invalidates captured contexts', () => {
    const runtime = new PluginRuntime<RuntimeScope>(scope => scope)
    let context!: RuntimeScope
    const clean = vi.fn()
    runtime.use({
      name: 'a',
      install(ctx) {
        context = ctx
        ctx.register('x', 'a', 1)
        ctx.onDispose(clean)
        return () => {
          throw new Error('cleanup')
        }
      },
      uninstall() {
        throw new Error('uninstall')
      },
    })
    expect(() => runtime.destroy()).toThrow(AggregateError)
    expect(clean).toHaveBeenCalledOnce()
    expect(context.signal.aborted).toBe(true)
    expect(runtime.values('x')).toEqual([])
    expect(() => context.register('x', 'z', 2)).toThrow('disposed')
    expect(() => runtime.destroy()).not.toThrow()
    expect(() => runtime.use({
      name: 'b',
      install() {
      },
    })).toThrow('destroyed')
  })
  it('enforces dependencies and destroys in reverse order', () => {
    const runtime = new PluginRuntime<RuntimeScope>(scope => scope)
    const order: string[] = []
    expect(() => runtime.use({
      name: 'b',
      requires: ['a'],
      install() {
      },
    })).toThrow('dependency')
    runtime.use({
      name: 'a',
      install() {
        return () => {
          order.push('a')
        }
      },
    })
    runtime.use({
      name: 'b',
      requires: ['a'],
      install() {
        return () => {
          order.push('b')
        }
      },
    })
    expect(() => runtime.remove('a')).toThrow('required')
    runtime.destroy()
    expect(order).toEqual(['b', 'a'])
  })
  it('preserves JSON keys while isolating and freezing nested data', () => {
    const input = JSON.parse('{"__proto__":{"x":1},"a":[{"b":2}]}')
    const snapshot = immutableJson(input)
    input.a[0].b = 3
    expect(snapshot.a[0].b).toBe(2)
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true)
    expect(Object.isFrozen(snapshot.a[0])).toBe(true)
    expect(() => immutableJson({
      fn() {
      },
    })).toThrow('JSON')
    expect(() => immutableJson({ a: NaN })).toThrow('JSON')
  })
})
it('publishes registry changes after installation/rollback and isolates observers', () => {
  const snapshots: unknown[][] = []
  const runtime = new PluginRuntime<RuntimeScope>(scope => scope, () => {
    snapshots.push(runtime.values('x'))
    throw new Error('observer')
  })
  runtime.use({
    name: 'ok',
    install(ctx) {
      ctx.register('x', 'a', 1)
      ctx.register('x', 'b', 2)
    },
  })
  expect(snapshots).toEqual([
    [1, 2],
  ])
  expect(runtime.errors).toHaveLength(1)
  expect(() => runtime.use({
    name: 'bad',
    install(ctx) {
      ctx.register('x', 'c', 3)
      throw new Error('failure')
    },
  })).toThrow('failure')
  expect(snapshots).toEqual([
    [1, 2],
    [1, 2],
  ])
  expect(() => runtime.use({
    name: 'nested',
    install() {
      runtime.use({
        name: 'child',
        install() {
        },
      })
    },
  })).toThrow('reentered')
  expect(runtime.has('nested')).toBe(false)
  expect(runtime.has('child')).toBe(false)
})
