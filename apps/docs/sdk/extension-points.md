# 扩展点

目前提供八类注册扩展点：块类型、命令、框架渲染器、工具栏、右键菜单、导出器、上传器和 AI 操作。注册项受插件作用域管理，支持显式覆盖和自动清理。

## 完整示例

```ts
import { definePlugin } from '@sword-editor/doc-editor'

const myPlugin = definePlugin({
  name: 'demo.callout',
  install(ctx) {
    // 1. 块类型
    ctx.registerBlockType({
      type: 'callout',
      label: '提示框',
      leaf: true,
      parse: (lines, i) => /^@\[callout\]\s+(.*)$/.exec(lines[i])
        ? { text: lines[i].split(/\s+/).slice(1).join(' '), consumed: 1 }
        : null,
      serialize: b => `@[callout] ${b.text}`,
    })

    // 2. 工具栏
    ctx.registerToolbar({
      id: 'demo.say',
      label: '动作',
      icon: 'sparkles',
      action: c => console.log(c.selectedBlocks),
    })

    // 3. 右键菜单（单块 + 多选）
    ctx.registerContextMenu({
      id: 'demo.dup',
      label: '复制选中块',
      icon: 'copy',
      group: 'operation',
      action: c => c.editor.duplicate(c.selection),
    })

    // 4. 导出器
    ctx.registerExporter({
      id: 'csv',
      label: 'CSV',
      export: ({ markdown }) => { /* 生成 csv 下载 */ },
    })

    // 5. 上传器
    ctx.registerUploader({
      id: 'demo.image',
      kind: 'image',
      label: '图片',
      upload: async file => ({ url: URL.createObjectURL(file) }),
    })

    // 6. AI 操作
    ctx.registerAiAction({
      id: 'demo.translate',
      label: 'AI 翻译',
      icon: 'sparkles',
      kind: 'polish',
      run: async ({ block, instruction }) => ({
        text: await translate(block?.text ?? '', instruction),
      }),
    })
  },
})
```

## 各扩展点类型

### 工具栏项 `ToolbarItem`

```ts
interface ToolbarItem {
  id: string
  label: string
  icon?: string
  when?: (ctx: EditorActionContext) => boolean
  action: (ctx: EditorActionContext) => void
}
```

### 右键菜单项 `ContextMenuItem`

```ts
interface ContextMenuItem extends ToolbarItem {
  group?: string   // 分组，用于分隔线
  danger?: boolean // 红色危险项（删除）
}
```

### 导出器 `Exporter`

```ts
interface Exporter {
  id: string
  label: string
  export: (payload: {
    editor: Editor
    blocks: Block[]
    markdown: string
    title?: string
  }) => void
}
```

### 上传器 `Uploader`

```ts
interface Uploader {
  id: string
  kind: 'image' | 'video' | 'attachment'
  label: string
  accept?: string
  upload: (file: File, options: { dir?: string }) => Promise<UploadResult>
}
```

### AI 操作 `AiAction`

```ts
interface AiAction {
  id: string
  label: string
  icon?: string
  kind: 'generate' | 'polish' | 'image'   // 交互形态
  run: (ctx: AiActionContext) => Promise<AiActionResult>  // 执行 AI 调用
  apply?: (ctx: AiActionContext, result: AiActionResult) => void  // 应用结果（缺省按 kind 兜底）
}
```

### 动作上下文 `EditorActionContext`

```ts
interface EditorActionContext {
  editor: Editor
  block: Block          // 命中的块
  index: number         // 命中块下标
  selection: string[]   // 多选集
  selectedBlocks: Block[]
}
```

## 插件管理器

```ts
const pm = editor.plugins

pm.use(plugin)          // 装载插件
pm.uninstall(name)      // 卸载插件
pm.blockTypes           // 已注册块类型
pm.toolbar              // 工具栏项
pm.contextMenu          // 右键项
pm.listInsertableBlocks() // 可插入的块
pm.listExporters()      // 导出器
pm.listUploaders()      // 上传器
pm.listAiActions()      // AI 操作
pm.getBlockType(type)
pm.getExporter(id)
pm.getUploader(id)
pm.getAiAction(id)
```

## 命令与渲染器

```ts
ctx.registerCommand({
  id: 'example.clear',
  execute(editor) {
    editor.remove(editor.blocks.map(block => block.id))
  },
})
// component 为对应框架的组件对象；id 为块类型。
ctx.registerRenderer({ id: 'callout', framework: 'vue', component: CalloutView })
```

命令通过 `editor.execute('example.clear')` 调用。React 渲染器使用 framework: 'react'，并提供 React 组件。覆盖已有注册时传第二参数 `{ override: true }`。当前命令 payload 为 unknown，自定义命令应自行验证输入；可提供同步 validate(payload) 和 command:before 拦截钩子；输入 schema 由插件定义，安全隔离由宿主负责。

清理、依赖和异常语义见 [生命周期](/sdk/lifecycle)，JSON 扩展字段保存见 [数据与持久化](/sdk/document)。
