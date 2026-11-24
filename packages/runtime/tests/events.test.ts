import { expect, it, vi } from 'vitest'
import { EventBus, resolvePlugins } from '../src/index.js'

it('publishes snapshots, skips unsubscribed listeners, queues reentry, and isolates async errors', async () => {
  const errors = vi.fn()
  const bus = new EventBus<{ tick: number }>(errors)
  const calls: number[] = []
  let off = () => {}
  bus.subscribe('tick', (value) => {
    calls.push(value)
    off()
    if (value === 1)
      bus.publish('tick', 2)
  })
  off = bus.subscribe('tick', () => {
    calls.push(99)
  })
  bus.subscribe('tick', async () => {
    throw new Error('async subscriber')
  })
  bus.publish('tick', 1)
  await Promise.resolve()
  expect(calls).toEqual([1, 2])
  expect(errors).toHaveBeenCalledTimes(2)
  bus.close()
  expect(() => bus.subscribe('tick', () => {})).toThrow('closed')
})
it('bounds runaway republishing and preserves optional dependency version constraints', () => {
  const errors = vi.fn()
  const bus = new EventBus<{ tick: number }>(errors)
  bus.subscribe('tick', (n) => {
    bus.publish('tick', n + 1)
  })
  bus.publish('tick', 0)
  expect(errors).toHaveBeenCalledOnce()
  expect(() => resolvePlugins([
    {
      name: 'a',
      requires: [
        { name: 'b', optional: true, version: '^2.0.0' },
      ],
    },
    { name: 'b', version: '1.0.0' },
  ])).toThrow('Incompatible')
})
