# 钩子与发布订阅

文档 SDK 提供类型化 HookMap。`editor.hooks.on()` 用于宿主注册，`ctx.hooks.on()` 用于插件注册；插件注册自动受作用域管理。组件包已内置相同 API，示例导入路径可替换为 `@sword-editor/vue` 或 `@sword-editor/react`，不需额外安装 SDK。

## 两种通道

- **决策钩子**在操作发生前执行，返回 `{ allow: true }` 或 `{ allow: false, code, message? }`。拒绝或抛错立即终止；非法返回和 Promise 均被拒绝。
- **通知与发布订阅**在操作完成后执行。`ctx.hooks.on()` 可按 priority 观察通知，`ctx.events.subscribe()` 可按名称订阅通知。通知处理器应同步返回 void；异常被隔离。事件订阅者允许返回 Promise，其拒绝也被捕获，但不会阻塞已完成的操作。

原 `editor.on((event, editor) => {})` 保留兼容，用于 change/selection/history/plugins/lifecycle/error。两种通道同时订阅会收到各自的通知，不要重复执行同一副作用。

## 可运行插件示例

```ts
import { Editor, DEFAULT_PLUGINS, definePlugin } from '@sword-editor/doc-editor'

const lengthLimit = definePlugin({
  name: 'example.length-limit',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  install(ctx) {
    ctx.hooks.on('transaction:beforeCommit', ({ after }) => {
      const size = after.blocks.reduce((sum, block) => sum + block.text.length, 0)
      return size <= 10000
        ? { allow: true }
        : { allow: false, code: 'DOCUMENT_TOO_LONG', message: '文档不能超过一万字' }
    }, { priority: 10 })

    ctx.events.subscribe('transaction:committed', ({ transactionId, revision }) => {
      console.log('已提交', transactionId, revision)
    })
  },
})

const editor = new Editor({ plugins: [...DEFAULT_PLUGINS, lengthLimit] })
editor.update(editor.blocks[0].id, { text: '你好' })
editor.destroy() // 钩子与订阅一起自动清理
```

要拦截最初的插件安装或文档加载，使用构造选项 setup；构造返回后注册不会补发初始化阶段：

```ts
const editor = new Editor({
  setup(hooks) {
    hooks.on('plugin:beforeInstall', ({ plugin }) =>
      plugin.name.startsWith('blocked.')
        ? { allow: false, code: 'PLUGIN_NOT_ALLOWED' }
        : { allow: true },
    )
    hooks.on('sdk:beforeReady', () => { /* 同步检查，无返回值；抛错可中止初始化 */ })
    hooks.on('sdk:destroyed', ({ cleanupFailed }) => { console.log(cleanupFailed) })
  },
  plugins: DEFAULT_PLUGINS,
})
```

## 钩子目录

所有输入包含 meta，完整输入/输出由公开 HookMap 类型定义。通知不携带正文和 provider 输出；提交前校验可读取冻结的 before/after 文档。

| 名称 | 模式 | 输入摘要/行为 |
| --- | --- | --- |
| sdk:beforeReady | 同步检查，void | 初始插件全部安装后；抛错清理实例 |
| sdk:ready | 通知 | 进入 ready，动态安装不重发 |
| sdk:beforeDestroy | 逆序通知 | 取消会话及清理之前，不能阻止销毁 |
| sdk:destroyed | 通知 | cleanupFailed；插件自身作用域此时已退出 |
| plugin:beforeInstall | 决策 | plugin manifest；依赖预检后、install 前 |
| plugin:installed | 通知 | plugin manifest；注册已成功 |
| plugin:installFailed | 通知 | manifest、code；作用域回滚后 |
| plugin:beforeRemove | 决策 | pluginId；仅主动卸载可拒绝 |
| plugin:removed | 通知 | pluginId、cleanupFailed；整体销毁也通知 |
| document:beforeLoad | 决策 | 已校验 document、nextGeneration；拒绝保留旧会话 |
| document:loaded | 通知 | documentId、generation |
| command:before | 决策 | commandId、input、revision；validate 通过后 |
| command:after | 通知 | commandId、revision；异步命令完成后通知 |
| command:error | 通知 | commandId、code |
| transaction:beforeCommit | 决策 | transactionId、冻结 before/after |
| transaction:committed | 通知 | transactionId、revision；状态与历史已完成 |
| transaction:rolledBack | 通知 | transactionId、code；状态已恢复 |
| history:changed | 通知 | canUndo、canRedo、revision |
| selection:changed | 通知 | 只读 ids |
| error:reported | 通知 | reportError 的稳定 code，不含原文错误对象 |
| ai:beforePrepare | 决策 | actionId、blockId；会话建立、读取目标前 |
| ai:prepareContext | 异步转换 | context、signal；按插件命名空间追加 JSON 补丁 |
| ai:beforeRun | 决策 | actionId、blockId；provider 调用前 |
| ai:progress | 通知 | progress（0–1），由 provider 主动上报 |
| ai:afterRun | 通知 | 输出校验后，候选尚未应用 |
| ai:beforeApply | 决策 | 确认应用且目标校验后；拒绝保留候选 |
| ai:applied | 通知 | 同步事务提交成功后 |
| ai:error / ai:cancelled | 通知 | 错误码或取消摘要 |

## 排序、快照与清理

宿主钩子先于插件钩子。插件按当前依赖层级优先，同层 priority 高者优先，再按安装顺序及插件内注册顺序稳定执行。sdk:beforeDestroy 按反序通知。一次分发使用处理器快照，新注册处理器下一次才参与；已 dispose 或信号取消的处理器跳过。disposer 幂等。

插件卸载、安装失败和 SDK 销毁自动清理插件拥有的钩子/订阅。被卸载插件不会收到自身 removed 通知；需要观察整体结果时使用宿主订阅。整体销毁不执行可拒绝的 beforeRemove，避免插件阻止资源释放。

钩子、具名通知或旧事件正在同步分发时，不允许重入修改文档或安装/卸载插件。需要响应通知继续编辑时，宿主可显式排队到分发结束后，并检查 state 与会话有效性。当前不自动排队生命周期修改。

## 事务与命令

beforeCommit 覆盖直接 insert/update/remove 等编辑、最外层复合事务和 undo/redo。拒绝直接操作不改变状态；拒绝复合事务会恢复块、选择和待发事件，不产生历史；拒绝 undo/redo 不弹出历史栈。嵌套事务异常回滚自己的保存点，并通知 rolledBack；只有最外层执行提交校验。

命令可提供同步 `validate(payload)`，抛错或返回 Promise 时不执行。命令的多步操作应显式包在 transaction 内；命令钩子本身不自动将任意 execute 包成事务（undo/redo 等不能运行在事务内）。自定义异步命令应采用“异步准备 → 会话/目标校验 → 同步事务”模式。SDK 无法回滚插件绕过公开 API 的外部副作用。

## 异步上下文与取消

```ts
ctx.hooks.on('ai:prepareContext', async ({ signal }) => {
  const response = await fetch('/api/editor-context', { signal })
  if (!response.ok) throw new Error('Context unavailable')
  return { glossary: await response.json() }
}, { failure: 'optional' })
```

结果放在 `AiActionContext.context[pluginName]`；宿主贡献使用 host 命名空间。补丁必须是可序列化 JSON 普通对象，结果冻结，不允许覆盖其他插件命名空间。默认 required，失败中止；只有 prepareContext 可声明 optional，失败记录诊断后跳过。取消始终中止，不能被 optional 吞掉。

AiSession 支持第四参数 `{ signal?, timeoutMs? }`，合并用户、会话、插件、超时信号。每次 await 前后和应用前重新校验；provider 忽略取消也会主动结束本地等待，迟到结果不会写回。createAiAdapter 的旧函数接口继续可用；自定义 AiAction 可读取 context、signal，并通过 onProgress 报告 0–1 进度。

## 发布订阅与诊断

```ts
const off = editor.events.subscribe('transaction:committed', ({ meta, revision }) => {
  console.log(meta.operationId, revision)
})
// 宿主订阅由宿主释放，也会在 editor.destroy() 时整体关闭。
off()
console.table(editor.diagnostics)
```

运行时另提供通用 `EventBus<Events>`，支持 snapshot 分发、unsubscribe、异步错误隔离、重入发布 FIFO 和 close。单轮超过 1000 条连续发布会中断并报告错误，防止同步递归循环。

诊断最多保留 500 条，只存 timestamp、traceId、operationId、pluginId、phase、durationMs、status、code，不存正文、提示词、资源、密钥和任意 cause。SdkError 提供 code、phase、pluginId、cause、retryable；诊断是内存追踪记录，不是远程日志系统。宿主应按需要脱敏后导出。

## 权限边界

EditorOptions.authorize(request) 是宿主同步能力门禁，当前覆盖 SDK 的文档写入、AI 调用/目标读取和上传资源读取入口；返回值必须为 true 才放行，不配置则兼容旧行为。request 包含 capability、可识别的 pluginId、documentId。直接属性读取与插件私有代码不受它隔离。

同一 JS realm 的插件仍能访问 editor、DOM 与全局网络 API，因此这不是通用权限沙箱。不可信插件需要独立 Worker/隔离 iframe/服务端进程及受限 RPC。隔离执行环境与权限授权界面由宿主应用负责。

## 插件协议与能力边界

完整接入流程见[插件架构与契约](/sdk/plugin-guide)：使用 `defineExtension` 定义 `name/version/apply/dispose` 协议，以受限 API 门面访问文档与命令；原生 `definePlugin` 继续支持渲染器等完整扩展点。Vue / React 使用者从各自组件包导入这些 API，无需额外安装 SDK。

插件间通知使用[消息通道](/sdk/messages)，核心决策使用[生命周期钩子](/sdk/hooks)。定时器、DOM 监听与自定义清理由[托管资源](/sdk/resources)管理；异步 `ai:prepareContext` 支持单钩子 `timeoutMs`。实际权限、性能与隔离限制见[能力边界](/sdk/plugin-boundaries)。
