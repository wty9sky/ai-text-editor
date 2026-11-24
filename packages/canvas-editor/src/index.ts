import type { StatePlugin } from '@sword-editor/runtime'
import { immutableJson, StateEditor } from '@sword-editor/runtime'

export type PortType = 'text' | 'image' | 'video' | 'audio' | 'number' | 'json'
export interface AssetRef {
  assetId: string
  kind: 'image' | 'video' | 'audio'
  url?: string
}
export interface CanvasNode {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  data: Record<string, unknown>
}
export interface CanvasEdge {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
}
export interface CanvasDocument {
  format: 'site.canvas-document'
  version: 1
  id: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: {
    x: number
    y: number
    zoom: number
  }
}
export type CanvasPlugin = StatePlugin<CanvasDocument>
export interface WorkflowNodeType {
  type: string
  inputs: Record<string, PortType>
  outputs: Record<string, PortType>
  run: (context: {
    node: CanvasNode
    inputs: Record<string, unknown>
    signal: AbortSignal
  }) => Promise<Record<string, unknown>>
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
export function parseCanvasDocument(input: unknown): CanvasDocument {
  const d = typeof input === 'string'
    ? JSON.parse(input)
    : input
  if (!d || d.format !== 'site.canvas-document' || d.version !== 1 || typeof d.id !== 'string' || !d.id || !Array.isArray(d.nodes) || !Array.isArray(d.edges))
    throw new Error('Invalid canvas document')
  if (!d.viewport || !finite(d.viewport.x) || !finite(d.viewport.y) || !finite(d.viewport.zoom) || d.viewport.zoom <= 0)
    throw new Error('Invalid viewport')
  const ids = new Set<string>()
  for (const node of d.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) || typeof node.type !== 'string' || !node.type || ![
      node.x,
      node.y,
      node.width,
      node.height,
    ].every(finite) || node.width <= 0 || node.height <= 0 || !node.data || typeof node.data !== 'object' || Array.isArray(node.data)) {
      throw new Error('Invalid canvas node')
    }
    ids.add(node.id)
  }
  const edges = new Set<string>()
  for (const edge of d.edges) {
    if (!edge || typeof edge.id !== 'string' || !edge.id || edges.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target) || typeof edge.sourcePort !== 'string' || !edge.sourcePort || typeof edge.targetPort !== 'string' || !edge.targetPort)
      throw new Error('Invalid canvas edge')
    edges.add(edge.id)
  }
  return immutableJson(d)
}
export const canvasNodesPlugin: CanvasPlugin = {
  name: 'canvas.nodes',
  install(ctx) {
    ctx.registerCommand('node.add', payload => ctx.editor.update(d => ({
      ...d,
      nodes: [...d.nodes, payload as CanvasNode],
    })))
    ctx.registerCommand('node.update', (payload) => {
      const p = payload as {
        id: string
        patch: Partial<Omit<CanvasNode, 'id'>>
      }
      ctx.editor.update(d => ({
        ...d,
        nodes: d.nodes.map(n => n.id === p.id
          ? {
              ...n,
              ...p.patch,
              id: n.id,
            }
          : n),
      }))
    })
    ctx.registerCommand('node.remove', (payload) => {
      const ids = new Set(payload as string[])
      ctx.editor.update(d => ({
        ...d,
        nodes: d.nodes.filter(n => !ids.has(n.id)),
        edges: d.edges.filter(e => !ids.has(e.source) && !ids.has(e.target)),
      }))
    })
  },
}
export const canvasConnectionsPlugin: CanvasPlugin = {
  name: 'canvas.connections',
  requires: ['canvas.nodes'],
  install(ctx) {
    ctx.registerCommand('edge.add', payload => ctx.editor.update(d => ({
      ...d,
      edges: [...d.edges, payload as CanvasEdge],
    })))
    ctx.registerCommand('edge.remove', payload => ctx.editor.update(d => ({
      ...d,
      edges: d.edges.filter(e => e.id !== payload),
    })))
  },
}
export const canvasViewportPlugin: CanvasPlugin = {
  name: 'canvas.viewport',
  install(ctx) {
    ctx.registerCommand('viewport.set', payload => ctx.editor.update(d => ({ ...d, viewport: payload as CanvasDocument['viewport'] })))
  },
}
export const DEFAULT_CANVAS_PLUGINS = [canvasNodesPlugin, canvasConnectionsPlugin, canvasViewportPlugin]
export class CanvasEditor extends StateEditor<CanvasDocument> {
  constructor(options: {
    document?: CanvasDocument
    plugins?: CanvasPlugin[]
  } = {}) {
    super(options.document ?? {
      format: 'site.canvas-document',
      version: 1,
      id: crypto.randomUUID(),
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, parseCanvasDocument, options.plugins ?? DEFAULT_CANVAS_PLUGINS)
  }

  screenToWorld(point: {
    x: number
    y: number
  }): {
    x: number
    y: number
  } {
    const v = this.document.viewport
    return { x: (point.x - v.x) / v.zoom, y: (point.y - v.y) / v.zoom }
  }

  worldToScreen(point: {
    x: number
    y: number
  }): {
    x: number
    y: number
  } {
    const v = this.document.viewport
    return { x: point.x * v.zoom + v.x, y: point.y * v.zoom + v.y }
  }

  visibleNodes(rect: {
    x: number
    y: number
    width: number
    height: number
  }): CanvasNode[] {
    return this.document.nodes.filter(n => n.x < rect.x + rect.width && n.x + n.width > rect.x && n.y < rect.y + rect.height && n.y + n.height > rect.y)
  }
}
function matches(type: PortType, value: unknown): boolean {
  if (type === 'json') {
    try {
      immutableJson(value)
      return true
    }
    catch {
      return false
    }
  }
  if (type === 'text')
    return typeof value === 'string'
  if (type === 'number')
    return finite(value)
  return !!value && typeof value === 'object' && (value as AssetRef).kind === type && typeof (value as AssetRef).assetId === 'string'
}
/** Execution state is intentionally separate from undoable scene state. Sequential DAG runner. */
export class WorkflowRunner {
  private controller?: AbortController
  private destroyed = false
  private running = false
  get state(): 'ready' | 'running' | 'destroyed' {
    return this.destroyed
      ? 'destroyed'
      : this.running ? 'running' : 'ready'
  }

  cancel(): void {
    this.controller?.abort()
  }

  destroy(): void {
    this.destroyed = true
    this.cancel()
  }

  async run(editor: CanvasEditor, options: {
    signal?: AbortSignal
    onProgress?: (nodeId: string) => void
  } = {}): Promise<Record<string, Record<string, unknown>>> {
    if (this.destroyed || this.running)
      throw new Error('Runner is destroyed or already running')
    editor.assertActive()
    const document = editor.document
    const revision = editor.revision
    const definitions = new Map(document.nodes.map(n => [
      n.id,
      editor.plugins.get<WorkflowNodeType>('workflow.node', n.type),
    ]))
    const incoming = new Map(document.nodes.map(n => [
      n.id,
      document.edges.filter(e => e.target === n.id),
    ]))
    const bound = new Set<string>()
    for (const node of document.nodes) {
      if (!definitions.get(node.id))
        throw new Error(`Unknown workflow node type: ${node.type}`)
    }
    for (const edge of document.edges) {
      const source = definitions.get(edge.source)!
      const target = definitions.get(edge.target)!
      if (!source.outputs[edge.sourcePort] || source.outputs[edge.sourcePort] !== target.inputs[edge.targetPort])
        throw new Error('Incompatible workflow ports')
      const key = JSON.stringify([edge.target, edge.targetPort])
      if (bound.has(key))
        throw new Error('Multiple connections to one input')
      bound.add(key)
    }
    for (const node of document.nodes) {
      for (const port of Object.keys(definitions.get(node.id)!.inputs)) {
        if (!bound.has(JSON.stringify([node.id, port])))
          throw new Error(`Missing workflow input: ${node.id}/${port}`)
      }
    }
    const order: CanvasNode[] = []
    const done = new Set<string>()
    while (order.length < document.nodes.length) {
      const next = document.nodes.find(n => !done.has(n.id) && incoming.get(n.id)!.every(e => done.has(e.source)))
      if (!next)
        throw new Error('Workflow contains a cycle')
      done.add(next.id)
      order.push(next)
    }
    this.controller = new AbortController()
    this.running = true
    const signal = AbortSignal.any([
      this.controller.signal,
      editor.signal,
      ...(options.signal
        ? [options.signal]
        : []),
    ])
    const assertCurrent = () => {
      signal.throwIfAborted()
      if (editor.revision !== revision)
        throw new Error('Canvas changed during workflow execution')
      for (const node of document.nodes) {
        if (editor.plugins.get('workflow.node', node.type) !== definitions.get(node.id))
          throw new Error('Workflow plugin changed during execution')
      }
    }
    const off = editor.on((event) => {
      if (event === 'change' || event === 'plugins') {
        try {
          assertCurrent()
        }
        catch {
          this.controller?.abort()
        }
      }
    })
    const outputs: Record<string, Record<string, unknown>> = Object.create(null)
    try {
      for (const node of order) {
        assertCurrent()
        const inputs = Object.fromEntries(incoming.get(node.id)!.map(e => [e.targetPort, outputs[e.source][e.sourcePort]]))
        const def = definitions.get(node.id)!
        const result = await def.run({
          node,
          inputs: immutableJson(inputs),
          signal,
        })
        assertCurrent()
        if (!result || typeof result !== 'object')
          throw new Error('Invalid workflow result')
        for (const [port, type] of Object.entries(def.outputs)) {
          if (!matches(type, result[port]))
            throw new Error(`Invalid workflow output: ${node.id}/${port}`)
        }
        outputs[node.id] = immutableJson(result)
        options.onProgress?.(node.id)
      }
      assertCurrent()
      return immutableJson(outputs)
    }
    finally {
      off()
      this.running = false
      this.controller = undefined
    }
  }
}
