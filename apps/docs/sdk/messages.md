# 插件间消息

核心 events 只允许订阅 SDK 通知。插件自定义通知使用单独的 messages 总线，不向内部 HookMap 塞入任意名字，也不能伪造 transaction:committed。

## 定义共享主题

```ts
import { defineTopic } from '@sword-editor/doc-editor'

export const wordCount = defineTopic<{ count: number }>('example.count:changed', (value) => {
  if (!value || typeof (value as { count?: unknown }).count !== 'number') {
    throw new TypeError('Expected a numeric count')
  }
})
```

主题为 namespace:event，建议把主题与 payload 类型放在共享协议模块。泛型只提供编译期检查；要验证外部数据，传同步 validate，抛错拒绝。校验返回 Promise 会报错且观察其拒绝，不能充当异步中间件。

## 发布与订阅

```ts
import { defineExtension } from '@sword-editor/doc-editor'
import { wordCount } from './topics'

export const counter = defineExtension({
  name: 'example.count',
  version: '1.0.0',
  apply(sdk) {
    sdk.events.subscribe('transaction:committed', () => {
      const count = sdk.document.snapshot().blocks.reduce((n, block) => n + block.text.length, 0)
      sdk.messages.publish(wordCount, { count })
    })
  },
})
export const observer = defineExtension({
  name: 'example.status',
  version: '1.0.0',
  apply(sdk) {
    sdk.messages.subscribe(wordCount, ({ data, source, sourceType, meta }) => {
      console.log(data.count, source, sourceType, meta.operationId)
    })
  },
})
```

插件只能发布以自身完整 name 加冒号为前缀的主题；任何插件可订阅其他主题。宿主通过 editor.messages 发布不受插件前缀限制，信封 sourceType 区分 host/plugin，source 为来源名称。命名空间防止误发，不是权限沙箱。

payload 被克隆并冻结为 JSON，发送后修改原对象不会影响接收方。禁止 DOM、函数、循环引用等不可 JSON 数据。信封含 topic、source、sourceType、meta、data。通知无返回值收集，不提供请求/响应、重放、持久化或跨 Editor 实例投递。

每次发布只遍历对应主题订阅者，使用快照；后注册者下一次参与，已退订者跳过。同步和异步订阅错误逐个隔离并进入 diagnostics，诊断不保存 payload。直接发布的输入校验失败会抛给发布方。

## 清理与重入

subscribe 返回幂等退订函数；ctx/sdk.messages 的订阅自动纳入插件作用域，卸载、安装失败和 destroy 一并释放。宿主订阅可手动退订，也会在 SDK 销毁时关闭。已退出插件的消息 API 拒绝发布和订阅。

消息是通知。同步消息监听器内不能重入文档修改；需要后续编辑时应排队到分发结束，并重新检查 state、signal 和目标。消息间重入发布按 FIFO 排队，单轮最多 1000 条，防止无限反馈。

高频通知应在生产端合并或节流；不要每次键入都广播全文。异步订阅回调不会被总线等待，不能靠它决定提交是否成功；需要拒绝提交时使用 transaction:beforeCommit。
