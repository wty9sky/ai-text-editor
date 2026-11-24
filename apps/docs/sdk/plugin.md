# 插件体系

通过[删除与撤销插件示例](/sdk/plugin-example)，按阶段学习命令、菜单、数据提交与清理的实现。

所有能力（块类型 / 工具栏 / 右键 / 导出 / 上传 / AI）都以**插件**形式挂载。插件在 `install(ctx)` 里向扩展点注册。

## 定义插件

```ts
import { definePlugin } from '@sword-editor/doc-editor'
import type { DocEditorPlugin } from '@sword-editor/doc-editor'

const myPlugin: DocEditorPlugin = definePlugin({
  name: 'my.video',          // 唯一名，用于去重 / 卸载
  install(ctx) {
    ctx.registerBlockType({
      type: 'video',
      label: '视频',
      leaf: true,
      parse: (lines, index) => {
        const m = /^@\[video\]\(([^)]+)\)\s*$/.exec(lines[index])
        return m ? { text: m[1].trim(), consumed: 1 } : null
      },
      serialize: block => `@[video](${block.text})`,
    })
  },
})
```

## 八类扩展点

| 扩展点 | 说明 |
| --- | --- |
| `registerCommand(command)` | 按 id 注册命令，由 editor.execute 调用 |
| `registerRenderer(renderer)` | 按 framework 与块类型 id 注册组件渲染器 |
| `registerBlockType(def)` | 新块类型（自动进入插入菜单与 Markdown 转换） |
| `registerToolbar(item)` | 顶部工具栏按钮 / 动作 |
| `registerContextMenu(item)` | 单块 / 多选右键动作 |
| `registerExporter(exporter)` | md / docx / pdf / png 等格式导出 |
| `registerUploader(uploader)` | 图片 / 视频 / 附件上传实现 |
| `registerAiAction(action)` | AI 生成 / 修饰 / 图片操作（见 [AI 接入](/sdk/ai)） |

## 块类型协议 `BlockTypeDef`

```ts
interface BlockTypeDef {
  type: string            // 唯一类型名
  label: string           // 插入菜单显示名
  icon?: string           // 图标名
  leaf?: boolean          // 是否无文本框（图片 / 视频 / 附件等）
  defaultText?: string    // 新块默认文本
  parse?: (lines: string[], index: number) => BlockParseResult | null  // Markdown → 块（null 表示不匹配）
  serialize?: (block: Block, ctx: SerializeContext) => string                       // 块 → Markdown
}
```

`parse` 返回 `{ text, props?, consumed }`；`consumed` 是消费的行数（多行块用）。

## 右键菜单 + 多选

右键项的 `action` 拿到 `EditorActionContext`，其中 `block` 是命中的块、`selection` 是多选集：

```ts
ctx.registerContextMenu({
  id: 'dup',
  label: '复制选中块',
  icon: 'copy',
  group: 'operation',
  action: c => c.editor.duplicate(c.selection),   // selection 是多选集
})
```

## 内置插件

`@sword-editor/doc-editor` 自带：

- `coreBlocksPlugin`：注册常用块类型（段落 / 标题 / 列表 / 引用 / 代码 / 图片 / 视频 / 附件 / 分割线）；
- `coreOpsPlugin`：把撤销 / 重做 / 上移 / 下移 / 复制 / 删除挂到工具栏与右键。

DEFAULT_PLUGINS 还包含 core.text（文本拆块命令，当前通过默认插件数组提供）。这些都是普通插件，可裁剪 / 替换。

```ts
import { Editor, DEFAULT_PLUGINS } from '@sword-editor/doc-editor'

// 默认加载内置插件
new Editor({ plugins: [...DEFAULT_PLUGINS, myPlugin] })

// 只加载自己的插件（不注册任何内置块）
new Editor({ plugins: [myPlugin] })
```

详细见 [扩展点](/sdk/extension-points)。

## 作用域与覆盖

所有 register 方法支持第二参数 `{ override?: boolean }`，默认同名报错；显式覆盖后，卸载覆盖插件会恢复上一层。每次注册返回幂等清理函数，插件退出时自动清理。

`ctx.signal` 是插件取消信号，`ctx.onDispose(cleanup)` 追踪订阅和资源。install 必须同步；可返回清理函数。uninstall 在插件信号取消后调用，之后逆序清理。安装失败自动回滚作用域内注册，不能撤销任意外部副作用。

requires 支持字符串名称和 { name, version, optional? } 版本依赖；useAll 自动拓扑排序，安装前预检版本、缺失依赖和环。未声明版本的旧插件不能满足带版本约束的依赖，不会伪造版本。apiVersion 约束当前运行时 API 1.0.0。不能在 install/uninstall 内同步重入插件生命周期。

完整行为和示例见 [生命周期与资源清理](/sdk/lifecycle)。组件使用者可把本文导入路径替换为 `@sword-editor/vue` / `@sword-editor/react`，无需安装 SDK。为避开 Vue 的全局注册插件同名值，领域插件类型统一可使用 `DocumentEditorPlugin` 别名。

## 钩子与发布订阅

ctx.hooks.on 注册类型化阶段钩子，ctx.events.subscribe 订阅具名通知；二者在插件退出时自动清理。同步决策可中止命令、加载或提交，通知不能改变已完成结果。完整例子见 [钩子与发布订阅](/sdk/hooks)。

## 插件协议与能力边界

完整接入流程见[插件架构与契约](/sdk/plugin-guide)：使用 `defineExtension` 定义 `name/version/apply/dispose` 协议，以受限 API 门面访问文档与命令；原生 `definePlugin` 继续支持渲染器等完整扩展点。Vue / React 使用者从各自组件包导入这些 API，无需额外安装 SDK。

插件间通知使用[消息通道](/sdk/messages)，核心决策使用[生命周期钩子](/sdk/hooks)。定时器、DOM 监听与自定义清理由[托管资源](/sdk/resources)管理；异步 `ai:prepareContext` 支持单钩子 `timeoutMs`。实际权限、性能与隔离限制见[能力边界](/sdk/plugin-boundaries)。
