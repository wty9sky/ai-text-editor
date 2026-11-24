# 插件性能与安全边界

扩展机制提供稳定协作点，并不使 SDK 拥有无限容量或自动获得第三方代码隔离能力。

## 性能策略

| 路径 | 策略 | 使用约束 |
| --- | --- | --- |
| events/messages | 按主题索引，只访问当前主题订阅者 | 单主题订阅者多时仍是线性遍历 |
| hooks | 排序结果缓存，注册/退订或插件 runtime revision 变化时失效 | 注册频繁变化、依赖图规模的成本 |
| 高频进度 | provider 显式上报，无自动全文广播 | 应用自行节流，不承诺每帧大量插件吞吐 |
| 数据历史 | 冻结 JSON 与未改动结构共享，有限快照 | before/after 校验与全文比较仍有文档规模成本 |
| 调试 | diagnostics 最多 500 条，消息递归队列最多 1000 次 | 不提供长期追踪存储或分布式 collector |
| 资源 | 完成 timeout 从组中移除，卸载清理剩余资源 | 外部未登记资源与不配合取消的 provider |
| 包体积 | 组件包内置 SDK/图标/导出依赖，仅框架 peer | 完整导出能力包含 docx/html2canvas |

排序缓存不改变依赖层级优先、priority 降序、安装顺序与插件内注册顺序，也不改变快照和清理规则。性能取决于文档规模、订阅数量及插件回调成本。

## 信任层级

| 代码来源 | 建议 |
| --- | --- |
| 自有或审计过的插件 | defineExtension 门面；需要高级注册时使用原生 PluginContext |
| 组织白名单插件 | 宿主 setup 注册 plugin:beforeInstall 决策，验证批准的 name/version |
| 不可信第三方代码 | 隔离 Worker/iframe/独立进程、受限 RPC 与宿主授权；当前 SDK 不提供现成隔离运行器 |

```ts
const approved = new Map([['example.limit', '1.0.0']])
const editor = new Editor({
  setup(hooks) {
    hooks.on('plugin:beforeInstall', ({ plugin }) =>
      approved.get(plugin.name) === plugin.version
        ? { allow: true }
        : { allow: false, code: 'PLUGIN_NOT_APPROVED' },
    )
  },
})
```

这是对 name/version 的宿主策略，不验证代码签名或供应链真实性；如果还装 DEFAULT_PLUGINS，需一并纳入批准策略或明确允许它们。

## 能力门禁与门面

EditorOptions.authorize 接收 capability、pluginId、documentId。ExtensionApi 的文档读取/修改、命令调用会经过相应检查；AI 和上传入口也有门禁。默认放行为了兼容旧插件。原生 PluginContext 仍包含完整 editor，直接属性读取及插件自行调用 fetch 不受隔离。

Object.freeze 与 TypeScript private 不能阻止同 realm 的恶意代码访问全局对象。消息命名空间、API 门面、运行时校验和白名单有助于减少误用，不能替代安全沙箱。权限审批、跨源 RPC 和代码签名验证由宿主应用负责。

## 扩展冲突与升级

优先组合普通插件并使用独立 id；只有经过明确设计才 override。卸载能力保留文档中的未知块，不能以卸载为由删除用户数据。依赖预检只验证名称、SemVer 和图关系，不判断功能是否语义兼容。

保持阶段数量有限且语义清晰。新增阶段必须明确同步/异步、返回值、取消、短路、回滚、通知与版本兼容规则。通用 next 中间件、跨插件响应收集、跨编辑器总线和自动重试不在当前契约内。
