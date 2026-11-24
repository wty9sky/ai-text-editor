# 图片编辑器

`@sword-editor/image-editor` 是**插件化多图层图片核心 + Canvas2D 渲染**的 headless SDK：不包含任何 UI，只提供图层数据模型、图层 / 裁剪 / 渲染 / 导出 / AI 命令，以及自定义图层渲染器扩展点。

## 安装

```bash
pnpm add @sword-editor/image-editor
```

它只依赖 `@sword-editor/runtime`（通用状态引擎与插件契约），不依赖任何框架。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| **图层（ImageLayer）** | 画布上的一个可变换元素：图片 / 纯色 / 文字，支持位移、旋转、缩放、透明度、混合模式与可见性 |
| **图片文档（ImageDocument）** | 画布尺寸 + 图层列表 + 可选裁剪区域，序列化为版本化 JSON |
| **渲染器（ImageLayerRenderer）** | 把图层绘制到 Canvas 的插件，通过 `image.layer` 扩展点注册 |
| **资产（asset）** | 图片图层只存 `assetId`，位图由调用方通过 `resolveAsset()` 加载，资源生命周期由调用方管理 |

## 最小示例

```ts
import { ImageEditor } from '@sword-editor/image-editor'

const editor = new ImageEditor()
editor.execute('layer.add', {
  id: 'background', type: 'solid', color: '#f5f5f5',
  x: 0, y: 0, width: 1024, height: 1024,
  rotation: 0, opacity: 1, visible: true, blend: 'source-over',
})
const blob = await editor.execute<Promise<Blob>>('image.export', {
  type: 'image/png',
  resolveAsset: async (assetId: string, signal: AbortSignal) => {
    const response = await fetch(`/assets/${encodeURIComponent(assetId)}`, { signal })
    return createImageBitmap(await response.blob())
  },
})
editor.destroy()
```

## 数据模型

### `ImageLayer`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 图层唯一 ID |
| `type` | `string` | 图层类型（内置 `image` / `solid` / `text`，或自定义） |
| `props` | `Record<string, unknown>` | 扩展字段（自定义图层用，未识别类型时原样保留） |
| `assetId` | `string` | 图片图层的资产 ID（`image` 类型必填） |
| `color` | `string` | 颜色（`solid` / `text` 类型必填） |
| `text` | `string` | 文字内容（`text` 类型必填） |
| `fontSize` | `number` | 字号（`text` 类型必填） |
| `x` / `y` | `number` | 图层左上角位置（文档坐标） |
| `width` / `height` | `number` | 图层尺寸（1 ~ 32768） |
| `rotation` | `number` | 旋转角度（度，绕图层中心） |
| `opacity` | `number` | 不透明度（0 ~ 1） |
| `visible` | `boolean` | 是否参与渲染 |
| `blend` | `'source-over' \| 'multiply' \| 'screen'` | 混合模式 |

### `ImageDocument`

```ts
interface ImageDocument {
  format: 'site.image-document'
  version: 1
  id: string
  width: number
  height: number
  background?: string
  layers: ImageLayer[]
  crop?: { x: number; y: number; width: number; height: number }
}
```

## 内置图层类型

| 类型 | 必需字段 | 渲染效果 |
| --- | --- | --- |
| `image` | `assetId` | `drawImage` 绘制位图（尺寸为图层宽高） |
| `solid` | `color` | 填充矩形 |
| `text` | `text`、`fontSize`、`color` | 单行基础文字（`sans-serif`） |

## 命令一览

图片编辑器通过 `editor.execute(id, payload)` 执行命令，所有命令都支持 undo / redo。

| 命令 | payload | 说明 |
| --- | --- | --- |
| `layer.add` | `ImageLayer` | 追加图层 |
| `layer.update` | `{ id, patch }` | 按 `id` 更新图层字段 |
| `layer.remove` | `string`（图层 id） | 删除图层 |
| `layer.reorder` | `{ id, index }` | 移动图层到指定下标 |
| `canvas.resize` | `{ width, height }` | 调整画板尺寸，保留图层坐标；越界的裁剪框会清除 |
| `canvas.background` | 六位十六进制颜色或 `null` | 设置底色或恢复透明背景 |
| `image.crop` | `{ x, y, width, height }` | 设置非破坏裁剪区域（不影响图层数据） |
| `image.render` | `RenderRequest` | 渲染到给定 Canvas 上下文 |
| `image.export` | `ExportRequest` | 渲染并导出为 `Blob` |
| `image.ai` | `{ instruction, signal? }` | 调 AI 生成新图层（需安装 `createImageAiPlugin`） |

图层操作示例：

```ts
editor.execute('layer.add', layer)
editor.execute('layer.update', { id: 'a', patch: { rotation: 45, opacity: 0.5 } })
editor.execute('layer.reorder', { id: 'b', index: 0 }) // 置顶
editor.execute('layer.remove', 'a')
editor.undo()  // 回退上一步
```

## 渲染与导出

渲染只处理 `visible` 图层，按图层顺序绘制，逐层应用 `opacity` / `blend` / `rotation`（绕图层中心旋转），并裁剪到 `crop` 区域。渲染是异步的：位图资产通过 `resolveAsset(assetId, signal)` 并行加载，加载期间文档或渲染器发生变化会抛错并拒绝迟到结果。

```ts
const request = {
  context: canvas.getContext('2d'),
  resolveAsset: async (assetId, signal) => createImageBitmap(await fetch(assetId, { signal }).then(r => r.blob())),
}
await editor.execute<Promise<void>>('image.render', request)
```

导出内部复用渲染逻辑，优先用 `OffscreenCanvas`，回退到 DOM `canvas`：

```ts
const blob = await editor.execute<Promise<Blob>>('image.export', {
  type: 'image/png',          // 默认 image/png；也支持 image/jpeg、image/webp
  quality: 0.92,              // jpeg / webp 质量
  resolveAsset,
})
```

## 自定义图层渲染器

通过 `image.layer` 扩展点注册自定义图层类型：

```ts
import type { ImageLayerRenderer } from '@sword-editor/image-editor'

const gantt: ImageLayerRenderer = {
  type: 'gantt',
  assets: layer => [String(layer.props?.assetId)],  // 可选：声明需要预加载的资产
  draw(context, layer, assets) {
    context.fillStyle = '#165dff'
    context.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height)
  },
}

editor.plugins.use({
  name: 'my.gantt',
  install(ctx) {
    ctx.register('image.layer', 'gantt', gantt)
  },
})
```

- `draw` 接收的坐标系原点在图层中心（已应用位移 / 旋转），绘制时用 `-width/2 ~ width/2` 范围。
- `assets` 声明的资产会先被 `resolveAsset` 解析，再以 `ReadonlyMap<string, CanvasImageSource>` 传入 `draw`。
- 未知图层在 JSON 里原样保留，但缺少对应渲染器时渲染会明确报错，不会静默丢图层。

## AI 生成新图层

用 `createImageAiPlugin(adapter)` 注册 `image.ai` 命令。生成结果作为**新图层**追加，不覆盖原图：

```ts
import { createImageAiPlugin } from '@sword-editor/image-editor'

editor.plugins.use(createImageAiPlugin({
  generate: async ({ instruction, document, signal }) => {
    const assetId = await myImageModel.generate(instruction, { signal })
    return { assetId }
  },
}))

await editor.execute('image.ai', { instruction: '把天空换成黄昏' })
editor.undo() // 删除 AI 生成的新图层，原图层不变
```

## 通用 API（继承自 `@sword-editor/runtime`）

`ImageEditor` 继承 `StateEditor`，除上述命令外还提供：

| 成员 | 说明 |
| --- | --- |
| `document` | 当前文档（只读冻结快照） |
| `revision` | 文档版本号，每次修改自增 |
| `execute(id, payload)` | 执行命令（异步命令返回 Promise） |
| `transaction(fn)` | 同步事务，合并为一次撤销 |
| `undo()` / `redo()` / `canUndo` / `canRedo` | 撤销 / 重做 |
| `load(input)` | 加载 JSON 文档（清空撤销栈，作废进行中的异步操作） |
| `on(listener)` | 订阅 `change` / `history` / `plugins` / `lifecycle` 事件 |
| `plugins` | 插件运行时：`use` / `remove` / `get` |
| `state` | `initializing → ready → destroying → destroyed` |
| `destroy()` | 幂等销毁，销毁后命令 / 订阅 / 修改都会失败 |

## 边界

- 渲染 / 导出要求浏览器 `Canvas2D` 或 `OffscreenCanvas`；导出格式取决于浏览器编码器支持。
- 编辑历史按图层操作记录。蒙版、像素笔刷与复杂滤镜不在当前组件的编辑范围。
- 文字图层为单行基础绘制。
- 自定义渲染器应同步绘制，并自行释放持有的资源。

## 生命周期与组件交付

本 SDK 沿用公共运行时的 initializing → ready → destroying → destroyed 状态、插件作用域清理和会话取消语义，详见 [生命周期](/sdk/lifecycle)。该页的文档专有事件/选择 API 不适用于本领域，请以本 SDK 类型为准。

此页面介绍 headless SDK 的数据与命令 API。


## 框架组件

Vue 3 从 `@sword-editor/vue` 引入 `ImageEditor`，React 从 `@sword-editor/react` 引入同名组件。另行导入对应包的 `style.css`。两端均支持 `initialDocument` 初始文档，默认画布为 960 × 540。从左侧添加文字、色块或本地图片，在右侧修改画板宽高和背景色。透明画板在编辑区以白色显示，PNG 导出保留透明像素。使用画板下方的缩放按钮查看细节，选择「平移」后拖动工作区，或按住鼠标中键拖动。「适应窗口」会重新居中画板。

图层面板从上到下列出前景到背景。选中图层后可以命名、复制、删除、调整层级、隐藏或锁定。拖动画布上的元素调整位置，松手提交后可一步撤销。点击「取格式」，再选中另一个图层并点击「应用格式」，可复制透明度、混合模式与文字样式。

文字支持字号、字体、加粗、下划线、横排、竖排、填充色与描边。字体使用浏览器可用字体。「标题模板」插入可继续编辑的文字层。

## PSD 交换

支持普通 RGB 像素图层的 PSD 导入和逐层栅格导出，支持普通、正片叠底和滤色混合模式。导入使用文件中的图层像素，导出的文字和色块也会栅格化为独立图层。含组、蒙版、剪贴、调整层或图层效果的文件需先在副本中栅格化相关部分。SDK 的 JSON 文档保留可编辑文字属性，图片资源需由宿主另外保存。

[打开图片编辑器 Playground](/playground/image)
