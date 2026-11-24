import type { CanvasNode, CanvasPlugin, WorkflowNodeType } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { CanvasEditor, DEFAULT_CANVAS_PLUGINS, WorkflowRunner } from '../src/index.js'

function node(id: string, type = 'text'): CanvasNode {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    data: {},
  }
}
function workflow(): CanvasPlugin {
  return {
    name: 'test.workflow',
    install(ctx) {
      const types: WorkflowNodeType[] = [
        {
          type: 'source',
          inputs: {},
          outputs: { value: 'text' },
          run: async () => ({ value: 'hello' }),
        },
        {
          type: 'upper',
          inputs: { value: 'text' },
          outputs: { value: 'text' },
          run: async ({ inputs }) => ({
            value: String(inputs.value).toUpperCase(),
          }),
        },
      ]
      for (const type of types)
        ctx.register('workflow.node', type.type, type)
    },
  }
}
function graph() {
  const e = new CanvasEditor({
    plugins: [
      ...DEFAULT_CANVAS_PLUGINS,
      workflow(),
    ],
  })
  e.execute('node.add', node('a', 'source'))
  e.execute('node.add', node('b', 'upper'))
  e.execute('edge.add', {
    id: 'edge',
    source: 'a',
    sourcePort: 'value',
    target: 'b',
    targetPort: 'value',
  })
  return e
}
describe('canvas SDK', () => {
  it('uses plugins for commands and preserves scene data after uninstall', () => {
    const bare = new CanvasEditor({ plugins: [] })
    expect(() => bare.execute('node.add', node('a'))).toThrow('Unknown command')
    const e = new CanvasEditor()
    e.execute('node.add', node('a'))
    expect(() => e.plugins.remove('canvas.nodes')).toThrow('required')
    e.plugins.remove('canvas.connections')
    e.plugins.remove('canvas.nodes')
    expect(e.document.nodes).toHaveLength(1)
    expect(() => e.execute('node.add', node('b'))).toThrow()
  })
  it('validates graph and viewport; supports undoable compound edits', () => {
    const e = new CanvasEditor()
    e.transaction(() => {
      e.execute('node.add', node('a'))
      e.execute('node.add', node('b'))
    })
    e.undo()
    expect(e.document.nodes).toHaveLength(0)
    e.redo()
    expect(() => e.execute('node.add', node('a'))).toThrow('node')
    expect(() => e.execute('edge.add', {
      id: 'e',
      source: 'a',
      sourcePort: 'x',
      target: 'missing',
      targetPort: 'x',
    })).toThrow('edge')
    e.execute('viewport.set', { x: 10, y: 20, zoom: 2 })
    expect(e.screenToWorld({ x: 30, y: 40 })).toEqual({ x: 10, y: 10 })
    expect(e.worldToScreen({ x: 10, y: 10 })).toEqual({ x: 30, y: 40 })
    expect(() => e.execute('viewport.set', { x: 0, y: 0, zoom: 0 })).toThrow('viewport')
  })
  it('removes connected edges atomically and resets history on JSON load', () => {
    const e = graph()
    const snapshot = JSON.stringify(e.document)
    e.execute('node.remove', ['a'])
    expect(e.document.edges).toHaveLength(0)
    e.undo()
    expect(e.document.edges).toHaveLength(1)
    e.load(snapshot)
    expect(e.canUndo).toBe(false)
    e.destroy()
    e.destroy()
    expect(() => e.execute('node.remove', ['a'])).toThrow('destroyed')
  })
  it('executes typed dataflow independently of document history', async () => {
    const e = graph()
    const before = JSON.stringify(e.document)
    const runner = new WorkflowRunner()
    const result = await runner.run(e)
    expect(result.b.value).toBe('HELLO')
    expect(JSON.stringify(e.document)).toBe(before)
    expect(runner.state).toBe('ready')
    runner.destroy()
    expect(runner.state).toBe('destroyed')
    await expect(runner.run(e)).rejects.toThrow('destroyed')
  })
  it('rejects cycles before executing and validates missing inputs', async () => {
    const e = graph()
    e.execute('node.update', {
      id: 'a',
      patch: { type: 'upper' },
    })
    e.execute('edge.add', {
      id: 'back',
      source: 'b',
      sourcePort: 'value',
      target: 'a',
      targetPort: 'value',
    })
    await expect(new WorkflowRunner().run(e)).rejects.toThrow('cycle')
    e.execute('edge.remove', 'back')
    await expect(new WorkflowRunner().run(e)).rejects.toThrow('Missing workflow input')
  })
  it('aborts a running provider when canvas changes', async () => {
    let finish!: (value: Record<string, unknown>) => void
    let signal!: AbortSignal
    const e = new CanvasEditor()
    e.plugins.use({
      name: 'slow',
      install(ctx) {
        ctx.register('workflow.node', 'slow', {
          type: 'slow',
          inputs: {},
          outputs: { value: 'text' },
          run: (c: {
            signal: AbortSignal
          }) => {
            signal = c.signal
            return new Promise((resolve) => {
              finish = resolve
            })
          },
        })
      },
    })
    e.execute('node.add', node('a', 'slow'))
    const runner = new WorkflowRunner()
    const pending = runner.run(e)
    e.execute('node.update', {
      id: 'a',
      patch: { x: 1 },
    })
    expect(signal.aborted).toBe(true)
    finish({ value: 'late' })
    await expect(pending).rejects.toBeDefined()
    expect(runner.state).toBe('ready')
  })
})
