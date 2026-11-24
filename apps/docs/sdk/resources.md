# 插件资源作用域

钩子、SDK 事件与 messages 订阅均自动追踪。原生插件的 ctx.resources 与扩展门面的 sdk.resources 用于追踪额外资源；直接创建的全局资源不会自动被发现。

## 定时器与 DOM 监听

```ts
import { defineExtension } from '@sword-editor/doc-editor'

export const autosaveHint = defineExtension({
  name: 'example.resources',
  version: '1.0.0',
  apply(sdk) {
    const stop = sdk.resources.interval(() => {
      if (!sdk.signal.aborted) console.log('插件仍然存活')
    }, 30000)
    sdk.resources.timeout(() => { stop() }, 120000)

    // DOM 能力仅客户端使用；SDK 模块导入不访问 document。
    if (typeof window !== 'undefined') {
      sdk.resources.listen(window, 'online', () => {
        console.log('网络恢复')
      })
    }
  },
})
```

timeout/interval 返回取消函数；listen 返回移除函数。delayMs 必须是 0–2147483647 范围内的有限数值。回调错误逐个隔离并记录 resource:callback；异步回调拒绝也会被观察，不让它成为未处理拒绝。资源工具不等待回调完成，异步工作仍应使用 sdk.signal。

完成的 timeout 会从资源组移除，避免长期运行不断保留已完成定时器的清理记录。卸载先取消 signal，再清理仍活动的定时器和 DOM 监听。重复取消无操作。

## 自定义资源

```ts
const objectUrl = URL.createObjectURL(file)
const release = sdk.resources.add(() => URL.revokeObjectURL(objectUrl))
// 可提前 release()，否则随插件退出释放。
```

add 可包装第三方订阅、对象 URL、观察器和其他同步清理。资源组按注册反序清理，一个 cleanup 抛错时继续释放其余资源，最终汇总报错。安装部分失败也执行这组清理。原有 ctx.onDispose(cleanup) 保留。

apply/install、dispose/uninstall 和清理函数都必须同步。清理若返回 Promise 会被明确拒绝，并观察其异步拒绝；destroy 不会假装等待异步清理完成。需要异步关闭握手时，应由宿主在 destroy 前显式等待，或让资源能同步取消并在后台自行收尾。

## 超时与取消的范围

- 单个 ai:prepareContext 处理器可设 `{ timeoutMs, failure: 'required' | 'optional' }`，收到合并后的 signal。
- optional 超时记录诊断并跳过；required 超时中止准备。整个 AI 会话取消始终中止。
- AiSession 第四参数的 timeoutMs 为会话总期限，从创建会话开始计算；插件卸载、用户取消、切换文档和 SDK 销毁也会使任务失效。
- 超时能结束本地等待，无法抢占同线程同步死循环，也不能回滚外部服务副作用。
