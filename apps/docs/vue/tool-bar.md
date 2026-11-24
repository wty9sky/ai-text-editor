# ToolBar 工具栏

`ToolBar` 提供块类型、字号、粗体、斜体、下划线、对齐、撤销重做、插入与导出操作。它使用关联编辑区的 SDK、选区、插件和历史记录。

## 独立接入

```vue
<script setup>
import { ref } from 'vue'
import { createDocEditorSession, ToolBar, DocEditorContent as Editor } from '@sword-editor/vue'
import '@sword-editor/vue/style.css'

const session = createDocEditorSession()
const markdown = ref('')
</script>

<template>
  <ToolBar :session="session" />
  <Editor :session="session" v-model="markdown" :min-height="320" />
</template>
```

工具栏不单独创建 SDK；没有关联的编辑区时，仅保留工具栏宿主位置。通过 session 连接编辑区，无需 DocEditorProvider。

## Props

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `session` | `DocEditorSession` | 与 Editor 共用的稳定会话；容器内组合时可省略 |

上传、AI、导出器及插件配置传给 [Editor](./editor)，工具栏自动使用该编辑器注册的能力。

## 选择与格式

选择文本块后可修改字号、粗体、斜体、下划线与对齐。多选时同时应用于所选文本块，并作为一次事务参与撤销。当前格式作用于整个块，不是字符范围的行内格式。

操作工具栏不会取消已有块选择。没有可操作的文本块时，文字格式控件禁用；插入和导出仍按对应能力工作。

## 插入与导出

插入菜单来自 SDK 注册的块类型，导出菜单来自已注册的导出器。图片、视频和附件的文件选择由关联编辑区处理。上传器和导出器的配置见 [上传](../sdk/upload) 与 [扩展点](../sdk/extension-points)。

## 容器内组合

使用 [DocEditor](./doc-editor#拆分工具栏与编辑区) 的插槽或 children 自定义布局时，ToolBar 可从容器上下文获取实例，不必传 session。独立接入和容器组合二选一即可。
