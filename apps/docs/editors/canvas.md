# 无限画布编辑器

`@sword-editor/canvas-editor` 是**插件化画布核心 + 独立 DAG 执行器**的 headless SDK：不包含任何 UI，只提供节点 / 连线 / 视口数据模型、场景命令、坐标换算，以及一个与撤销历史分离的工作流执行器。

## 安装

```bash
pnpm add @sword-editor/canvas-editor
```

它只依赖 `@sword-editor/runtime`，不依赖任何框架。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| **节点（CanvasNode）** | 画布上的一个矩形元素，携带任意 `data`，通过 `type` 关联工作流节点类型 |
| **连线（CanvasEdge）** | 连接两个节点的指定端口 |
| **视口（viewport）** | 平移 + 缩放，坐标换算在 `CanvasEditor` 上直接提供 |
| **工作流节点类型（WorkflowNodeType）** | 声明输入 / 输出端口类型与执行函数，通过 `workflow.node` 扩展点注册 |

## 最小示例

```ts
import { CanvasEditor, WorkflowRunner } from '@sword-editor/canvas-editor'
import type { WorkflowNodeType } from '@sword-editor/canvas-editor'

const canvas = new CanvasEditor()
canvas.plugins.use({
  name: 'example.text-source',
  install(ctx) {
    const type: WorkflowNodeType = {
      type: 'source', inputs: {}, outputs: { text: 'text' },
      async run({ node, signal }) {
        signal.throwIfAborted()
        return { text: String(node.data.text ?? '') }
      },
    }
    ctx.register('workflow.node', type.type, type)
  },
})
canvas.execute('node.add', {
  id: 'source-1', type: 'source', x: 0, y: 0,
  width: 200, height: 100, data: { text: 'hello' },
})
const runner = new WorkflowRunner()
const outputs = await runner.run(canvas)
runner.destroy()
canvas.destroy()
```

## 数据模型

### `CanvasNode`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 节点唯一 ID |
| `type` | `string` | 节点类型（关联 `workflow.node` 注册的类型） |
| `x` / `y` | `number` | 节点位置（世界坐标） |
| `width` / `height` | `number` | 节点尺寸（> 0） |
| `data` | `Record<string, unknown>` | 任意业务数据 |

### `CanvasEdge`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 连线唯一 ID |
| `source` | `string` | 源节点 id |
| `sourcePort` | `string` | 源节点输出端口 |
| `target` | `string` | 目标节点 id |
| `targetPort` | `string` | 目标节点输入端口 |

### `CanvasDocument`

```ts
interface CanvasDocument {
  format: 'site.canvas-document'
  version: 1
  id: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: { x: number; y: number; zoom: number }
}
```

### 端口与资产引用

```ts
type PortType = 'text' | 'image' | 'video' | 'audio' | 'number' | 'json'

interface AssetRef {
  assetId: string
  kind: 'image' | 'video' | 'audio'
  url?: string
}
```

多媒体输出以 `{ assetId, kind }` 引用外部资源，不把位图写进场景快照。

## 命令一览

| 命令 | payload | 说明 |
| --- | --- | --- |
| `node.add` | `CanvasNode` | 添加节点 |
| `node.update` | `{ id, patch }` | 按 `id` 更新节点 |
| `node.remove` | `string[]`（节点 id 数组） | 批量删除节点，**同时清理相关连线** |
| `edge.add` | `CanvasEdge` | 添加连线 |
| `edge.remove` | `string`（连线 id） | 删除连线 |
| `viewport.set` | `{ x, y, zoom }` | 设置视口（`zoom > 0`） |

场景操作示例：

```ts
editor.transaction(() => {          // 一次撤销
  editor.execute('node.add', nodeA)
  editor.execute('node.add', nodeB)
})
editor.execute('node.remove', ['a'])   // 删除节点 a 及其连线
editor.execute('edge.add', { id: 'e', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' })
editor.execute('viewport.set', { x: 10, y: 20, zoom: 2 })
```

## 坐标换算

视口坐标以画布容器局部坐标为基准，调用方需先减去容器偏移。

| 方法 | 说明 |
| --- | --- |
| `screenToWorld(point)` | 屏幕 / 容器坐标 → 世界坐标：`(point - viewport) / zoom` |
| `worldToScreen(point)` | 世界坐标 → 屏幕坐标：`point * zoom + viewport` |
| `visibleNodes(rect)` | 返回与给定世界矩形相交的节点（用于按视口裁剪渲染） |

```ts
const world = editor.screenToWorld({ x: 30, y: 40 })
const visible = editor.visibleNodes({ x: 0, y: 0, width: 1000, height: 800 })
```

## 工作流执行

`WorkflowRunner` 与场景历史分离：执行不修改节点 / 连线数据，也不会进入 undo / redo。

### 注册工作流节点类型

```ts
import type { WorkflowNodeType } from '@sword-editor/canvas-editor'

const upper: WorkflowNodeType = {
  type: 'upper',
  inputs: { value: 'text' },
  outputs: { value: 'text' },
  run: async ({ inputs, signal }) => ({ value: String(inputs.value).toUpperCase() }),
}

canvas.plugins.use({
  name: 'demo.upper',
  install(ctx) {
    ctx.register('workflow.node', 'upper', upper)
  },
})
```

### 运行

```ts
const runner = new WorkflowRunner()
const outputs = await runner.run(canvas, {
  onProgress: nodeId => console.log('done', nodeId),
})
// outputs: { [nodeId]: { [port]: value } }
runner.destroy()
```

### 执行前校验

`run()` 会先做完整校验，任何一项不满足即抛错：

- 每个节点的 `type` 都有对应的 `workflow.node` 注册；
- 连线的端口类型匹配（源输出类型 === 目标输入类型）；
- 同一目标节点的同一输入端口只允许一条连线（无重复输入）；
- 每个节点的每个输入端口都必须有连线（无缺失输入）；
- 图必须无环。

### 执行与取消

校验通过后按**拓扑顺序串行**执行：上游输出作为下游输入，每个节点的返回值按 `outputs` 声明校验类型后写入结果。执行支持取消：

```ts
runner.cancel() // 主动取消
```

- 执行期间场景（节点 / 连线）或插件注册变化会自动中止并抛错；
- `run()` 的 `state` 为 `ready` / `running` / `destroyed`；
- 一次只能运行一个工作流，重复 `run` 会报错。

## 通用 API（继承自 `@sword-editor/runtime`）

`CanvasEditor` 继承 `StateEditor`，除上述能力外还提供：

| 成员 | 说明 |
| --- | --- |
| `document` | 当前文档（只读冻结快照） |
| `revision` | 文档版本号，每次修改自增 |
| `execute(id, payload)` | 执行命令 |
| `transaction(fn)` | 同步事务，合并为一次撤销 |
| `undo()` / `redo()` / `canUndo` / `canRedo` | 撤销 / 重做 |
| `load(input)` | 加载 JSON 文档（清空撤销栈） |
| `on(listener)` | 订阅 `change` / `history` / `plugins` / `lifecycle` 事件 |
| `plugins` | 插件运行时：`use` / `remove` / `get` |
| `state` | `initializing → ready → destroying → destroyed` |
| `destroy()` | 幂等销毁 |

## 边界

- `WorkflowRunner` 当前为串行 DAG 执行：无并行调度、持久化任务、自动重试、断点恢复与循环节点。
- 没有拖拽连线、缩放手势、吸附与节点 UI（由宿主 UI 处理）。
- AI 等能力由工作流节点类型插件自行实现。

## 生命周期与组件交付

本 SDK 沿用公共运行时的 initializing → ready → destroying → destroyed 状态、插件作用域清理和会话取消语义，详见 [生命周期](/sdk/lifecycle)。该页的文档专有事件/选择 API 不适用于本领域，请以本 SDK 类型为准。

此页面介绍 headless SDK 的数据与命令 API。
