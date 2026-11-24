# 生命周期与资源清理

本文介绍编辑器的生命周期与资源管理契约。文档 SDK 的 `Editor` 与画布/图片 SDK 使用的 `StateEditor` 均有四个状态；文档专有的事件与事务行为以下单独说明。组件使用者可从 `@sword-editor/vue` 或 `@sword-editor/react` 导入本文的 `Editor`、`definePlugin` 和类型，无需另装文档 SDK。

## SDK 状态

[![SDK 生命周期状态](/diagrams/sdk-lifecycle.svg)](/diagrams/sdk-lifecycle.svg)

| 阶段 | 当前行为 | 使用约束 |
| --- | --- | --- |
| `initializing` | 建立初始数据、加载可选文档、先预检依赖图，再按拓扑顺序安装插件 | install 必须同步；批量安装自动将依赖排在使用方之前 |
| `ready` | 编辑、执行命令、动态安装/卸载插件 | 动态安装不会再次触发全局 ready |
| `destroying` | 发出 lifecycle、取消当前会话、按安装逆序移除插件 | 不再修改状态、执行命令或新增订阅 |
| `destroyed` | 清空历史和选择，发出 lifecycle 并清除监听器 | 最终数据仍可读；destroy 再次调用无操作 |

构造器返回时已经是 `ready`。构造后再订阅不会补发 ready；要观察初始化，应在插件 install 中订阅。初始化失败会抛错并清理此前安装成功的插件，不能把失败实例当作可用编辑器。清理遇到错误会尽可能继续，最终可能抛出 `AggregateError`；错误不阻止进入 destroyed。

## 在插件中观察生命周期

```ts
import { definePlugin, Editor, DEFAULT_PLUGINS } from '@sword-editor/doc-editor'

const lifecyclePlugin = definePlugin({
  name: 'example.lifecycle',
  install(ctx) {
    // 此时 editor.state 为 initializing（动态安装时为 ready）。
    ctx.onDispose(ctx.editor.on((event, editor) => {
      if (event === 'lifecycle') {
        console.log(editor.state)
      }
    }))
    ctx.onDispose(() => {
      // 移除 DOM 监听、释放对象 URL 或关闭本插件拥有的资源。
    })
  },
  uninstall(ctx) {
    // 此时 ctx.signal 已取消，不要继续注册能力。
  },
})

const editor = new Editor({ plugins: [...DEFAULT_PLUGINS, lifecyclePlugin] })
try {
  // 编辑操作
}
finally {
  editor.destroy()
}
```

插件内追踪的监听器会在插件清理时注销，通常能观察到 ready 和 destroying；它在最终 destroyed 通知前已被移除。需要观察最终状态时，应在插件作用域外订阅并由宿主负责取消。

## 插件安装、回滚与卸载

1. `plugins.use(plugin)` 校验名称与依赖图；requires 支持旧字符串和带 version/optional 的依赖对象。版本使用 SemVer，apiVersion 校验运行时 API 1.0.0。相同名称已安装时直接返回，不会替换原插件。
2. 创建插件作用域和 `ctx.signal`，调用同步 `install(ctx)`。所有 `register*` 与 `ctx.onDispose` 均归本插件所有。
3. install 可返回清理函数；返回 Promise 会报错。安装失败会取消信号，逆序运行已追踪清理并移除该插件的注册项。
4. 成功后通知 `plugins` 变化。`useAll()` 在执行插件前预检依赖缺失、版本与环并自动拓扑排序；预检失败无插件代码执行。某个 install 运行失败时，前面成功安装的插件仍保留。构造器失败则会清理整个实例。
5. `plugins.remove(name)` 在有已安装依赖方时拒绝卸载。允许卸载时先取消插件信号，再调用 uninstall，最后逆序运行清理，移除记录并通知。
6. SDK 整体销毁按安装逆序卸载，继续处理各项清理错误后汇总抛出。

注册返回的 disposer 幂等，可提前移除单项能力。覆盖必须显式传入 `{ override: true }`；移除覆盖插件后恢复仍存在的上一层。卸载不会删除文档中的对应块。安装、卸载内部不能同步重入安装/卸载或销毁；当前会抛错，不会自动排队。

## 文档会话与取消

| 信号/标识 | 有效范围 | 失效时机 |
| --- | --- | --- |
| `ctx.signal` | 单个插件安装作用域 | 安装回滚、卸载、整体销毁 |
| `editor.signal` | 当前文档会话 | 成功加载另一份文档、setBlocks、整体销毁 |
| `generation` | 当前会话序号 | 每次成功加载递增，即使文档 id 相同 |
| `revision` | 本地状态修订计数 | 数据修改、历史恢复、加载、事务回滚等；不是协作版本 |

`loadDocument()` 先校验输入，失败不取消旧信号。校验成功后取消旧会话，更新数据、清空选择和历史，再通知 change/selection/history。`syncDocument()` 对相同 JSON 内容不重载，适合受控组件回传去重。

异步任务应把 signal 传给 provider，并在 await 后再次检查。SDK 的 `AiSession` 和 `uploadFile()` 还会校验会话、目标块指纹及能力是否被卸载/替换，拒绝迟到写入。取消只表示本地不再接受结果，不保证远端服务停止或撤销副作用。

## 事务与事件顺序

文档的 `transaction(callback)` 是同步保存点：内部修改暂存通知，最外层成功时记录一个历史步骤，再分发去重后的事件。嵌套失败回滚到该层保存点；Promise 返回值会被拒绝。回滚恢复块、选择与待发事件，并增加 revision，随后通知 transaction:rolledBack。最外层真正提交前执行 transaction:beforeCommit；拒绝不改变历史。直接编辑与历史恢复也经过校验。

事务内不能加载文档、撤销、重做或销毁。网络调用应在事务外完成，检查目标有效后再通过同步事务应用结果。旧 on 监听器异常会被隔离并记录到 errors，具名通知与钩子错误记录到 diagnostics；均不回滚已提交状态。

## 组件与实例所有权

Vue 的 DocEditor 在 setup 中创建实例，卸载时取消组件任务、释放 AI 会话、取消订阅并销毁实例；SSR 请放入 ClientOnly。React 在 effect 中创建实例，cleanup 中销毁，兼容 StrictMode 的创建/清理重放；首个渲染周期可能为空。

当前组件没有外部 editor 属性。ref/defineExpose 暴露的是组件拥有的实例，宿主不要在组件仍挂载时主动 destroy。插件、上传器、导出器和 AI 属性目前作为挂载配置读取，修改配置需要重新挂载；直接操作实例插件管理器可动态增删能力。

## 命名钩子与发布订阅

已提供 sdk、plugin、document、command、transaction、history、selection、error 和 AI 阶段的类型化钩子。ctx.hooks.on 注册作用域内处理器，ctx.events.subscribe 订阅提交后通知；构造选项 setup 可注册初始化前宿主钩子。完整目录、顺序、拒绝/异常语义见 [钩子与发布订阅](/sdk/hooks)。

文档 HookMap 属于文档 SDK，不适用于画布/图片 SDK。插件依赖使用 SemVer 与拓扑预检，诊断保存在实例内存中。宿主 authorize 是 SDK 能力门禁；代码隔离、远程诊断存储和权限授权界面由宿主应用负责。

## 插件协议与能力边界

完整接入流程见[插件架构与契约](/sdk/plugin-guide)：使用 `defineExtension` 定义 `name/version/apply/dispose` 协议，以受限 API 门面访问文档与命令；原生 `definePlugin` 继续支持渲染器等完整扩展点。Vue / React 使用者从各自组件包导入这些 API，无需额外安装 SDK。

插件间通知使用[消息通道](/sdk/messages)，核心决策使用[生命周期钩子](/sdk/hooks)。定时器、DOM 监听与自定义清理由[托管资源](/sdk/resources)管理；异步 `ai:prepareContext` 支持单钩子 `timeoutMs`。实际权限、性能与隔离限制见[能力边界](/sdk/plugin-boundaries)。
