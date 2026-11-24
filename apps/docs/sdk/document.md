# 数据与持久化

文档编辑器以 JSON 保存完整工程，以 Markdown 做内容交换。自定义块属性和 metadata 应保存 JSON，Markdown 无法无损表达任意扩展字段。

## JSON 格式

```ts
import type { EditorDocument } from '@sword-editor/doc-editor'

const document: EditorDocument = {
  format: 'site.block-document',
  version: 1,
  id: 'document-001',
  metadata: { title: '项目说明' },
  blocks: [
    { id: 'block-001', type: 'paragraph', text: '你好', props: { custom: true } },
  ],
}
```

格式保留既有 `site.block-document` 标识，不随 npm 包名变化。块 id 必须非空且不重复，type 非空，text 为字符串。props、metadata 为对象且所有数据必须可 JSON 序列化；循环引用、函数、非有限数字和非普通对象会被拒绝。未知块类型和扩展字段保留；未知 format/version 会明确报错，当前没有版本迁移器。

## 加载与保存

```ts
import { Editor, DEFAULT_PLUGINS, parseDocument, syncDocument } from '@sword-editor/doc-editor'

const editor = new Editor({ plugins: DEFAULT_PLUGINS })
const stored = localStorage.getItem('draft')
if (stored) editor.loadDocument(parseDocument(stored))

const off = editor.on((event) => {
  if (event === 'change') {
    localStorage.setItem('draft', JSON.stringify(editor.toDocument()))
  }
})

// 外部回传当前内容时不重载，保留历史与会话信号。
syncDocument(editor, editor.toDocument())
off()
editor.destroy()
```

localStorage 是浏览器示例；生产应用可替换成自己的持久化服务，并处理容量、权限和保存失败。SDK 不自动上传文档。

`loadDocument(input)` 接受对象或 JSON 字符串，总是开启新会话，即使 id 相同。`setBlocks(blocks)` 也开启新会话，并产生新的文档 id，不保留旧 metadata。两者均清空历史和选择；校验失败保留旧数据。`toDocument()` 返回冻结快照，修改请使用公开命令或事务。

`syncDocument(editor, input)` 先验证，再以当前 JSON 序列化结果比较；相同时返回 false，变化时调用 loadDocument 并返回 true。它用于回传去重，不是协作合并或属性顺序无关的深比较器。

## 组件双向绑定

Vue 从 `@sword-editor/vue` 导入 EditorDocument，使用 `v-model:document`；React 从 `@sword-editor/react` 导入，使用 document/onDocumentChange。无需另装 SDK。组件同时提供 Markdown 输入时，JSON 优先。

- 相同内容回传保留历史，不触发内容回传循环。
- 外部不同 JSON 内容替换视为切换文档，清空历史并使旧异步任务失效。
- 未传数据属性时由组件内部持有内容。
- JSON 更适合未知块、props、metadata 的无损往返；不要把 Markdown 当作工程备份。

详情见 [Vue DocEditor](/vue/doc-editor) 与 [React DocEditor](/react/doc-editor)，会话语义见 [生命周期](/sdk/lifecycle)。
