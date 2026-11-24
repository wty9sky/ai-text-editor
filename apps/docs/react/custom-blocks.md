# 自定义块组件

通过 `blockRenderers` 或插件渲染器扩展块的显示和交互。配置可传给独立 [Editor](./editor) 或一体化 [DocEditor](./doc-editor)。

## 渲染器接入

`blockRenderers` 可以替换任意块，包括内置 `paragraph`、标题和代码块。渲染器只负责视图与交互，数据通过 SDK 修改。

```tsx
import { useMemo, useState } from 'react'
import { DocEditor, definePlugin } from '@sword-editor/react'
import type { BlockRendererProps, EditorDocument } from '@sword-editor/react'
import '@sword-editor/react/style.css'

function CounterBlock({ block, editor, update, remove }: BlockRendererProps) {
  function increment() {
    editor.transaction(() => {
      update({ props: { ...block.props, count: Number(block.props?.count || 0) + 1 } })
    })
  }
  return (
    <div data-editor-interactive>
      <span>计数：{block.props?.count || 0}</span>
      <button type="button" data-editor-focus onClick={increment}>加一</button>
      <button type="button" onClick={remove}>删除</button>
    </div>
  )
}
const blockRenderers = { counter: CounterBlock }
export function Example() {
  const [document, setDocument] = useState<EditorDocument>()
  const plugins = useMemo(() => [definePlugin({
    name: 'example.counter',
    version: '1.0.0',
    install(ctx) {
      ctx.registerBlockType({ type: 'counter', label: '计数器', leaf: true, defaultText: '', serialize: block => `计数：${block.props?.count || 0}` })
    },
  })], [])
  return <DocEditor document={document} onDocumentChange={setDocument} plugins={plugins} blockRenderers={blockRenderers} />
}
```

从插入菜单选择“计数器”即可添加。需要封装渲染插件时，可以在 install 中调用 `ctx.registerRenderer({ id: 'counter', framework: 'react', component: CounterBlock })`；替换已注册的内置渲染器时，使用第二参数 `{ override: true }`。

自定义子组件也可使用组件包导出的 `useDocEditor()` 获取所在编辑器上下文。

### 渲染器契约

| prop | 类型 | 说明 |
| --- | --- | --- |
| `editor` | `Editor` | 当前编辑器 SDK，可调用命令、事务或订阅 |
| `block` | `Block` | 当前不可变块快照 |
| `index` | `number` | 当前块下标，不作为长期身份 |
| `update` | `(patch: Partial<Block>) => void` | 通过 SDK 更新当前块 |
| `remove` | `() => void` | 通过 SDK 删除当前块 |

交互根节点使用 `data-editor-interactive`，避免编辑器框选逻辑阻止自定义控件。将 `data-editor-focus` 放在可聚焦元素上，供插入/拆块后的焦点导航使用。自定义编辑器不必使用内置文本编辑方式，可以接入自己的表单、图表或专业编辑控件。

使用 `block.id` 关联异步工作，在完成前检查文档会话与目标是否仍有效。组件内自行建立的 SDK 订阅、DOM 监听或定时器需要在组件卸载时清理；通过插件作用域注册的资源随插件退出清理。

## 完整示例

```tsx
import { DocEditor } from '@sword-editor/react'
import { createFunctionUploader, createAiAdapter } from '@sword-editor/react'
import '@sword-editor/react/style.css'

const uploaders = [
  createFunctionUploader({ kind: 'image', upload: f => oss.put(f) }),
  createFunctionUploader({ kind: 'video', upload: f => oss.put(f) }),
  createFunctionUploader({ kind: 'attachment', upload: f => oss.put(f) }),
]

const ai = createAiAdapter({
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: import.meta.env.VITE_OPENAI_KEY,
  model: 'gpt-4o',
})

export default function Editor({ markdown, onChange }) {
  return (
    <DocEditor
      value={markdown}
      onChange={onChange}
      title="我的文档"
      uploaders={uploaders}
      ai={ai}
      minHeight={400}
      maxHeight={720}
    />
  )
}
```

## 插件协议与能力边界

完整接入流程见[插件架构与契约](/sdk/plugin-guide)：使用 `defineExtension` 定义 `name/version/apply/dispose` 协议，以受限 API 门面访问文档与命令；原生 `definePlugin` 继续支持渲染器等完整扩展点。从 `@sword-editor/react` 导入这些 API，无需额外安装 SDK。

插件间通知使用[消息通道](/sdk/messages)，核心决策使用[生命周期钩子](/sdk/hooks)。定时器、DOM 监听与自定义清理由[托管资源](/sdk/resources)管理；异步 `ai:prepareContext` 支持单钩子 `timeoutMs`。实际权限、性能与隔离限制见[能力边界](/sdk/plugin-boundaries)。

