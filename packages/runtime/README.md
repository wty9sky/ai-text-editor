# @sword-editor/runtime

插件运行时和通用不可变状态引擎。

完整接口示例、生命周期契约、兼容性说明和当前边界见仓库 `docs/architecture/editor-sdks.md`。

这是初始 SDK 版本；画布、图片包不包含完整产品 UI。

公开工具包括 PluginRuntime、resolvePlugins（依赖图/SemVer 预检与拓扑排序）、EventBus<Events>（具名发布订阅与错误隔离）、abortable（取消后及时结束等待）和 immutableJson。文档 SDK 的 HookMap 建立在这些基础机制上，画布/图片不自动拥有文档专有钩子。

`createScopedResources(signal, track, onError)` 提供作用域定时器、DOM 监听与自定义清理；回调错误隔离，释放按逆序执行，重复取消幂等。同步资源清理不能返回 Promise。
