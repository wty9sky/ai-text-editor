# Editor 引擎

Editor 管理文档块、选择、事务、历史、事件和插件。独立使用时从 `@sword-editor/doc-editor` 导入；组件使用者从对应的 `@sword-editor/vue` / `@sword-editor/react` 导入同样的 API。

## 创建与释放

```ts
import { Editor, DEFAULT_PLUGINS, createBlock } from '@sword-editor/doc-editor'

const editor = new Editor({ plugins: DEFAULT_PLUGINS })
const off = editor.on((event, instance) => {
  if (event === 'change') console.log(instance.toDocument())
})
editor.insert(0, createBlock('paragraph', '你好'))
off()
editor.destroy()
```

`new Editor()` 不自动安装默认插件。需要内置块、菜单和命令时传入 DEFAULT_PLUGINS。可通过 document 构造选项加载初始 JSON，详见 [数据与持久化](/sdk/document)。

## 数据和命令

| 方法 | 说明 |
| --- | --- |
| `loadDocument(input)` | 校验并加载对象/JSON 字符串，开启新会话 |
| `toDocument()` | 导出冻结 JSON 快照 |
| `setBlocks(blocks)` | 新建文档 id 并替换块，清空历史/选择 |
| `insert(index, blockOrBlocks)` | 按索引插入；自动将索引限制到列表范围 |
| `update(id, patch)` | 更新字段；不能改变 id |
| `remove(ids)` | 批量删除；删空时保留一个空段落 |
| `move(ids, delta)` | 选中块上/下移动，delta 为 -1 或 1 |
| `duplicate(ids)` | 复制块并分配新 id |
| `convert(id, type)` | 转换类型；转为 leaf 时清空 text |
| `getBlock(id)` / `indexOf(id)` | 查找块/索引 |
| `execute(id, payload?)` | 执行插件命令，未知命令抛错 |
| `transaction(callback)` | 同步保存点，支持嵌套回滚 |
| `undo()` / `redo()` | 恢复历史；事务内不可调用 |
| `destroy()` | 幂等销毁，详见生命周期 |

## 选择

`select(ids, additive?)` 只保留存在的 id；`selectRange(fromId, toId, additive?)` 选择两个 id 之间的块；`toggleSelect(id)` 切换单块；`clearSelection()` 清空选择。selection 返回只读 id 数组，selectedBlocks 返回选中的块对象。

## 状态属性

| 属性 | 说明 |
| --- | --- |
| `blocks` / `selection` / `selectedBlocks` | 当前块与选择快照 |
| `plugins` | PluginManager，管理能力和查询注册项 |
| `hooks` / `events` | 类型化钩子注册与具名通知订阅 |
| `diagnostics` | 最近最多 500 条不含正文的追踪摘要 |
| `state` | initializing / ready / destroying / destroyed |
| `signal` | 当前文档会话取消信号；加载后需重新读取 |
| `documentId` / `generation` / `revision` | 文档 id / 会话序号 / 本地修订计数 |
| `canUndo` / `canRedo` | 历史操作是否可用 |
| `errors` | 最近最多 100 条错误的副本 |

快照及嵌套 props 不可直接修改。通过 update/insert/命令提交更新，避免绕过历史和通知。

## 事件

```ts
const off = editor.on((event, editor) => {
  if (event === 'lifecycle') console.log(editor.state)
  if (event === 'error') console.error(editor.errors.at(-1))
})
// 不再使用时 off()
```

| 事件 | 触发条件 |
| --- | --- |
| `change` | 文档加载、数据修改、历史恢复 |
| `selection` | 选择变化，以及加载/编辑/历史恢复后的选择刷新 |
| `history` | 加载、编辑、undo/redo 后刷新历史状态 |
| `plugins` | 插件注册、安装、卸载和回滚等能力变化 |
| `lifecycle` | 进入 ready、destroying、destroyed |
| `error` | 显式 reportError(error)，包括组件捕获的操作错误 |

旧 on 监听器接收的是通知，不能取消已经提交的编辑；需拦截请使用 hooks.on 的决策钩子。监听器异常被隔离并进入 errors，不会递归触发 error 事件。普通方法抛错也不会自动变成 error 事件，宿主应捕获或调用 reportError。精确的清理及会话顺序见 [生命周期](/sdk/lifecycle)。

## 历史与事务

连续单字段 text 更新在相同块、相邻操作间隔小于 800ms 时合并；结构操作逐次记录快照。文档历史最多保留 200 条撤销快照。加载文档会清空历史。

```ts
editor.transaction(() => {
  editor.update(editor.blocks[0].id, { text: '修改内容' })
  editor.insert(1, createBlock('paragraph', '补充说明'))
})
editor.undo() // 一次撤销整个复合编辑
```

事务内不能 await、加载文档、undo/redo 或 destroy。事务回滚恢复数据与选择，不会撤销网络请求等外部副作用。当前为本地快照历史，不提供多人协作一致性或用户级远程撤销。

## 流程扩展

EditorOptions 支持 setup(hooks) 在初始化前注册宿主处理器，以及 authorize(request) 同步能力门禁。插件通过 ctx.hooks 和 ctx.events 扩展流程，详见 [钩子与发布订阅](/sdk/hooks)。通知分发期间禁止重入文档修改，异步后续编辑需由宿主排队并重新校验会话。
