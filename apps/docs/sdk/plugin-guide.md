# 插件架构与开发指南

通过[删除与撤销插件示例](/sdk/plugin-example)，按阶段学习命令、菜单、数据提交与清理的实现。


本文把插件设计准则映射到当前文档 SDK 实现。它是插件开发入口；精确阶段与输入类型见 [钩子与发布订阅](/sdk/hooks)，数据与事务见 [Editor](/sdk/editor)。Vue/React 的组件包均已内置 SDK，以下示例的导入路径可替换成对应组件包，无需另装 doc-editor。

## 职责分工

[![插件管理器与扩展职责](/diagrams/plugin-responsibilities.svg)](/diagrams/plugin-responsibilities.svg)

选型规则：需要顺序、上下文转换或拒绝操作，使用明确的核心钩子；只想广播一件已经发生的事，使用消息或通知；注册、依赖和退出交给管理器。

## 推荐协议：apply/dispose

```ts
import { defineExtension } from '@sword-editor/doc-editor'

export const limit = defineExtension({
  name: 'example.limit',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  apply(sdk) {
    sdk.hooks.on('transaction:beforeCommit', ({ after }) =>
      after.blocks.length <= 1000
        ? { allow: true }
        : { allow: false, code: 'BLOCK_LIMIT' },
    )
    sdk.commands.register({
      id: 'example.limit.clear',
      execute(api) {
        const ids = api.document.snapshot().blocks.map(block => block.id)
        api.document.remove(ids)
      },
    })
  },
  dispose() {
    // 可选：释放本插件私有资源。SDK 作用域资源会自动清理。
  },
})
```

使用 `editor.plugins.use(limit)` 或把它放入组件 plugins 数组。defineExtension 返回普通 DocEditorPlugin，与旧插件共用同一管理器。

### 门面 API 范围

| API | 能力 |
| --- | --- |
| document.snapshot() | 获取冻结 JSON；执行 document.read 门禁 |
| document.update / insert / remove / transaction | 经公开数据操作、历史、钩子和写入门禁修改 |
| commands.register / execute | 注册扩展命令，或执行命令；execute 作为可写入口检查调用方权限 |
| hooks.on / events.subscribe | 注册阶段处理器，观察 SDK 通知 |
| messages.publish / subscribe | 插件间自定义 JSON 消息 |
| resources.add / timeout / interval / listen | 统一资源释放 |
| signal | 当前插件安装作用域信号 |

门面不暴露原始 Editor、PluginManager、私有字段或任意注册表。需要自定义块 schema、框架 renderer、上传器等完整注册能力的受信任插件，继续用 [原生 definePlugin](/sdk/plugin) 的 PluginContext。门面限制 API 面积，不是 JavaScript 安全沙箱。

apply 必须同步，可返回同步清理函数。dispose 被登记后才调用 apply，因此 apply 部分失败也会执行 dispose；dispose 应容忍未完成初始化。成功卸载时先取消 signal，执行 apply 返回的清理，再执行 dispose 及其余作用域清理，均最多一次。不要同时在两个清理入口释放同一个非幂等资源。

## 生命周期名称如何对应

采用现有规范名称，避免重复通知和歧义：

| 通用术语 | 当前入口 | 时机 |
| --- | --- | --- |
| beforeInit | 构造选项 setup；plugin:beforeInstall / document:beforeLoad | setup 在首批插件及初始文档前注册宿主策略 |
| 初始化完成前 | sdk:beforeReady | 初始插件已装好、ready 之前；与 beforeInit 不同 |
| afterInit | sdk:ready | ready 后；构造完成后不会补发 |
| beforeRequest | ai:beforePrepare / ai:prepareContext / ai:beforeRun | 只覆盖 SDK AI 会话，不拦截插件任意 fetch |
| afterResponse | ai:afterRun | provider 结果校验完成，尚未写入文档 |
| beforeApply | ai:beforeApply + transaction:beforeCommit | 目标检查后、真正提交前可拒绝 |
| beforeDestroy | sdk:beforeDestroy | 逆序通知，不能阻止整体清理 |
| afterDestroy | sdk:destroyed | 清理结束，宿主观察最终状态 |

同步决策可短路，异步 prepareContext 可追加命名空间上下文，通知只观察。当前没有通用 next() 中间件或自动重试链；确有需要时应新增有类型、有取消/错误契约的阶段，不能把事件回调当作事务拦截器。

## 稳定版本与冲突处理

- 插件 version 为 SemVer；apiVersion 为运行时插件 API 范围，当前 API 为 1.0.0。
- 依赖字段为 requires；支持旧字符串或 `{ name, version, optional? }`，批量安装预检再拓扑排序。旧插件未声明 version 时不会伪造版本满足约束。
- 同名插件 use 保持幂等，不热替换。更新应先按依赖顺序卸载，再安装新版本。
- 能力同名默认拒绝，只有原生注册的显式 override 才覆盖；卸载恢复上一层。门面命令注册默认不允许覆盖。
- 新增可选字段通常兼容；删除或改变钩子语义需废弃期、迁移说明及 API 主版本边界。npm 版本仍需单独管理。

## 错误不是全部吞掉

通知错误隔离后记录诊断，其他订阅者继续；必需决策、校验或准备失败中止本次操作，保留旧文档/候选，不拖垮整个已就绪实例。初始化必需插件失败则必须清理并抛错，不能返回半初始化 SDK。单次 useAll 在运行期失败时保留前面成功安装项，避免声称能回滚任意外部副作用。

同步代码无法用 timeout 抢占 CPU 死循环。异步准备支持每钩子 timeoutMs，AI 会话支持总 timeoutMs；超时或取消能结束本地等待，不能保证远端服务停机或退款。

## 相关文档

- [插件间消息](/sdk/messages)：主题、校验、命名空间与卸载。
- [资源作用域](/sdk/resources)：定时器、DOM、清理失败和信号。
- [钩子目录](/sdk/hooks)：顺序、短路、异步转换、诊断。
- [性能与安全边界](/sdk/plugin-boundaries)：高频策略、门禁、隔离和包体积。

