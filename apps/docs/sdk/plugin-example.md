# 插件示例：从右键删除到撤销

以内置 `core.ops` 插件为例，了解如何把一个操作拆成**交互入口、命令、数据修改和资源清理**。它在 Vue 与 React 中共用同一套逻辑，提供撤销、重做、移动、复制和删除操作。

本文先分阶段讲解其中的删除与撤销，再给出可直接接入的精简插件。精简版本使用独立名称和 ID，避免与内置操作冲突。

## 操作流程

[![删除与撤销插件操作流程](/diagrams/plugin-delete-undo.svg)](/diagrams/plugin-delete-undo.svg)

点击流程图可查看原图。

通知只用于观察，不能拒绝已提交的结果。内容策略放在 `transaction:beforeCommit`，命令策略放在 `command:before`。删除最后一个块时，Editor 自动保留一个空段落。

## 第一阶段：定义插件与安装入口

内置插件使用 `definePlugin`：

```ts
import { definePlugin } from '@sword-editor/vue'

export const coreOpsPlugin = definePlugin({
  name: 'core.ops',
  install(ctx) {
    // 在这里注册命令、工具栏和菜单。
  },
})
```

这段是结构片段；组件已经包含完整的内置 `core.ops`，不要把这个同名片段再次传入组件。

`install` 同步注册能力，不执行删除。`ctx` 是当前安装的插件上下文，注册项归该作用域所有。这里使用原生 `definePlugin`，因为插件需要注册工具栏和右键菜单；`defineExtension` 的受限门面不提供这两类注册入口。

Vue 使用者从 `@sword-editor/vue` 导入；React 使用者将本文导入路径替换为 `@sword-editor/react`。两者均无需额外安装文档 SDK。

## 第二阶段：把操作注册为命令

以下是内置插件的删除命令及输入检查：

```ts
function ids(input: unknown): string[] {
  if (!Array.isArray(input) || !input.every(id => typeof id === 'string'))
    throw new Error('Expected block id array')
  return input
}

// 放在 install(ctx) 中。
ctx.registerCommand({
  id: 'core.delete',
  execute: (editor, payload) => editor.remove(ids(payload)),
})
```

菜单不直接修改正文，而是调用命令；键盘快捷键或宿主按钮也可以调用同一个命令。

这里的内置输入检查在命令处理器中执行。自定义命令也可以提供同步 `validate(payload)`，使输入检查先于 `command:before`。命令处理器应通过公开数据 API 写入，避免修改编辑器内部字段。

## 第三阶段：确定单选与多选目标

```ts
import type { EditorActionContext } from '@sword-editor/vue'

function targetIds(ctx: EditorActionContext): string[] {
  return ctx.selection.includes(ctx.block.id)
    ? [...ctx.selection]
    : [ctx.block.id]
}
```

`block` 是右键命中的块，`selection` 是当前选择集。例如选择了 A、B：右键 B 删除 A、B；右键未选中的 C，只删除 C。

## 第四阶段：连接菜单与命令

内置删除菜单的注册代码：

```ts
// 放在 install(ctx) 中。
ctx.registerContextMenu({
  id: 'core.delete',
  label: '删除',
  icon: 'trash-2',
  group: 'operation',
  danger: true,
  action: (c) => {
    c.editor.execute('core.delete', targetIds(c))
  },
})
```

菜单 ID 与命令 ID 可以相同，因为它们属于不同注册表。`danger` 表示危险操作的显示样式；`action` 才负责调用命令。Vue / React 的菜单组件读取注册项并渲染，不需要在插件里编写两份菜单 UI。

## 第五阶段：注册撤销入口

```ts
// 放在 install(ctx) 中。
ctx.registerCommand({
  id: 'core.undo',
  execute: editor => editor.undo(),
})
ctx.registerToolbar({
  id: 'core.undo',
  label: '撤销',
  icon: 'undo-2',
  when: ({ editor }) => editor.canUndo,
  action: ({ editor }) => {
    editor.execute('core.undo')
  },
})
```

`when` 返回 false 时隐藏入口。删除操作的历史记录由 Editor 管理，插件不维护第二份历史栈；撤销也会经过 `transaction:beforeCommit`，可以被宿主策略拒绝。

单次 `remove` 已是一个提交。若一个自定义命令需要同时修改多个块，应使用同步 `editor.transaction(() => { ... })` 合并历史与通知；执行一个命令本身不会自动将多次写入包装成事务。

## 完整示例：创建自己的删除插件

下面保留上述插件的目标选择规则与命令分层，使用独立标识，并将输入检查放到 `validate` 中。新建 `delete-plugin.ts`：

```ts
import { definePlugin } from '@sword-editor/vue'
import type { EditorActionContext } from '@sword-editor/vue'

function ids(input: unknown): string[] {
  if (!Array.isArray(input) || !input.every(id => typeof id === 'string'))
    throw new Error('Expected block id array')
  return input
}

function targetIds(ctx: EditorActionContext): string[] {
  return ctx.selection.includes(ctx.block.id)
    ? [...ctx.selection]
    : [ctx.block.id]
}

export function createDeletePlugin() {
  return definePlugin({
    name: 'example.delete',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    install(ctx) {
      ctx.registerCommand({
        id: 'example.delete.remove',
        validate: (payload) => { ids(payload) },
        execute: (editor, payload) => editor.remove(ids(payload)),
      })
      ctx.registerCommand({
        id: 'example.delete.undo',
        execute: editor => editor.undo(),
      })
      ctx.registerContextMenu({
        id: 'example.delete.menu',
        label: '删除选定块',
        icon: 'trash-2',
        group: 'operation',
        danger: true,
        action: (c) => {
          c.editor.execute('example.delete.remove', targetIds(c))
        },
      })
      ctx.registerToolbar({
        id: 'example.delete.undo-button',
        label: '撤销编辑',
        icon: 'undo-2',
        when: ({ editor }) => editor.canUndo,
        action: ({ editor }) => {
          editor.execute('example.delete.undo')
        },
      })
    },
  })
}
```

这个插件会增加“删除选定块”和“撤销编辑”入口，内置删除与撤销入口仍然存在。它不声明 `requires`，因为只调用 Editor 的公开方法，没有依赖其他插件注册的能力。若命令必须调用另一个插件的命令，则应声明该插件依赖。

### Vue 接入

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DocEditor } from '@sword-editor/vue'
import '@sword-editor/vue/style.css'
import { createDeletePlugin } from './delete-plugin'

const content = ref('# 操作示例\n\n第一段\n\n第二段')
const plugins = [createDeletePlugin()]
</script>

<template>
  <DocEditor v-model="content" :plugins="plugins" />
</template>
```

### React 接入

先将 `delete-plugin.ts` 中的两个包导入路径改为 `@sword-editor/react`：

```tsx
import { useMemo, useState } from 'react'
import { DocEditor } from '@sword-editor/react'
import '@sword-editor/react/style.css'
import { createDeletePlugin } from './delete-plugin'

export function Example() {
  const [value, setValue] = useState('# 操作示例\n\n第一段\n\n第二段')
  const plugins = useMemo(() => [createDeletePlugin()], [])

  return <DocEditor value={value} onChange={setValue} plugins={plugins} />
}
```

为每个编辑器调用一次工厂，并保持传入的 plugins 数组引用稳定。插件的可变状态应放在 install 内，避免多个编辑器共享状态。

## 第六阶段：卸载与清理

宿主获取组件暴露的 editor 后，可卸载该插件：

```ts
editor.plugins.remove('example.delete')
```

管理器取消插件 signal，并释放它注册的命令、菜单、工具栏项。这个例子只使用受管理的注册 API，因此不需要额外写 uninstall，也不应在卸载时删除用户正文。组件卸载时会销毁其 Editor，并清理插件。

如果继续添加订阅或外部资源，按其归属管理：

| 需求 | 使用方式 |
| --- | --- |
| 观察已提交编辑 | `ctx.events.subscribe('transaction:committed', listener)`，随插件退出自动退订 |
| 拒绝特定编辑 | `ctx.hooks.on('transaction:beforeCommit', handler)`，返回 Decision |
| 插件间业务通知 | `ctx.messages.publish/subscribe`，仅在确有独立业务消息时使用 |
| 定时器或 DOM 监听 | `ctx.resources.timeout/interval/listen` |
| 第三方订阅等资源 | `ctx.resources.add(cleanup)` 或 `ctx.onDispose(cleanup)` |

内置 `core.ops` 不需要自定义消息通道：菜单直接调用确定的命令，Editor 已提供提交与历史通知。不要为了使用所有扩展机制，给一个删除操作额外增加消息跳转。

更多协议见[插件指南](/sdk/plugin-guide)、[生命周期钩子](/sdk/hooks)和[资源作用域](/sdk/resources)。
