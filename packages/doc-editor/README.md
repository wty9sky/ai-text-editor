# @sword-editor/doc-editor

框架无关的文档 SDK：块模型、冻结 JSON 快照、Markdown 转换、选择、历史、同步事务、插件、上传/AI 会话和导出器。

独立 headless 使用时安装本包。使用 Vue/React 组件时仅安装 @sword-editor/vue 或 @sword-editor/react，文档 SDK 及其类型已经内置，API 从对应组件包导入。

```ts
import { Editor, DEFAULT_PLUGINS, definePlugin } from '@sword-editor/doc-editor'

const guard = definePlugin({
  name: 'example.limit',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  install(ctx) {
    ctx.hooks.on('transaction:beforeCommit', ({ after }) =>
      after.blocks.length <= 1000
        ? { allow: true }
        : { allow: false, code: 'TOO_MANY_BLOCKS' },
    )
    ctx.events.subscribe('transaction:committed', ({ revision }) => {
      console.log(revision)
    })
  },
})
const editor = new Editor({ plugins: [...DEFAULT_PLUGINS, guard] })
editor.update(editor.blocks[0].id, { text: '你好' })
const json = editor.toDocument()
editor.destroy()
```

- hooks.on 注册宿主钩子，ctx.hooks.on 注册插件作用域钩子；决策同步短路，通知隔离。
- events.subscribe 按具名通知订阅，插件订阅自动清理；旧 editor.on 继续兼容。
- transaction:beforeCommit 覆盖直接编辑、最外层事务和历史恢复。拒绝提交不会写入历史。
- requires 支持名称及带 SemVer 约束的依赖，useAll 预检并自动拓扑排序；旧插件版本不被伪造。
- AiSession 支持异步命名空间上下文、取消/超时、目标冲突校验和同步应用；uploadFile 共享取消与目标校验。
- diagnostics 最多保存 500 条阶段摘要，不记录正文或 provider 输出。
- authorize 为宿主能力门禁；同 realm 插件仍可访问全局 JS，不是隔离沙箱。

完整流程与已实现钩子目录见仓库 apps/docs/sdk/hooks.md；生命周期见 apps/docs/sdk/lifecycle.md，JSON 持久化见 apps/docs/sdk/document.md。需要 DOM 的导出与上传能力仅在浏览器调用。当前没有协作一致性协议或不可信插件隔离执行环境。

### 插件开发契约

`defineExtension({ name, version, apiVersion, apply(sdk), dispose() })` 提供冻结的受限门面；需要完整渲染器等扩展点时使用原生 `definePlugin`。`sdk.messages` 是插件间命名主题通知，`sdk.hooks` 扩展核心流程，`sdk.resources` 托管定时器、DOM 监听与清理。依赖预检、SemVer、拓扑顺序、错误隔离及卸载由插件管理器统一处理。异步准备钩子支持独立 `timeoutMs`。

完整协议和限制见仓库文档站 `apps/docs/sdk/plugin-guide.md`、`messages.md`、`resources.md`、`plugin-boundaries.md`。受限门面和能力门禁不构成不可信 JavaScript 的安全沙箱。
