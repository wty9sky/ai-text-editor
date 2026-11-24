# 快速开始

## 安装

```bash
pnpm add @sword-editor/vue
```

组件仅要求宿主提供 Vue ^3.5；文档 SDK、图标和导出依赖已随组件包内置，无需额外安装。所有 UI 均已自封装（Tailwind CSS + CSS 变量），无需注册任何第三方组件库。

## 最小接入

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DocEditor } from '@sword-editor/vue'

const markdown = ref('# 你好\n\n这是一段文字')
</script>

<template>
  <DocEditor v-model="markdown" />
</template>
```

`v-model` 绑定的是 **Markdown 字符串**，内部自动做 Markdown ↔ 块 的双向转换。

## 引入样式

编辑器自带基础主题（亮色 + 深色），入口引入一次：

```ts
import '@sword-editor/vue/style.css'
```

样式通过 CSS 变量表达颜色，覆盖同名变量即可换肤（`--accent` / `--ink-*` / `--line` …）。

## 上传与插件

工厂和类型直接由组件包提供：

```ts
import { createFunctionUploader, definePlugin } from '@sword-editor/vue'
import type { DocumentEditorPlugin, EditorDocument } from '@sword-editor/vue'

const uploaders = [createFunctionUploader({
  kind: 'image',
  label: '图片',
  upload: async (file, options) => {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/api/upload', { method: 'POST', body, signal: options.signal })
    if (!response.ok) throw new Error('上传失败')
    const result: { url: string } = await response.json()
    return { url: result.url, name: file.name, size: file.size }
  },
})]
const plugin: DocumentEditorPlugin = definePlugin({
  name: 'example.lifecycle',
  install(ctx) {
    ctx.onDispose(ctx.editor.on((event) => {
      if (event === 'change') console.log(ctx.editor.documentId)
    }))
  },
})
```

将 uploaders 与 `[plugin]` 传给 DocEditor 对应属性。示例后端约定 `/api/upload` 返回 `{ url: string }`，需由宿主实现。导出器 md/docx/pdf/png 已内置，图标和 SDK 均无需另装。

## 生命周期与配置

组件拥有内部 Editor，卸载自动清理。SSR 页面请使用 ClientOnly。当前插件、上传器、导出器和 AI 配置在挂载时读取，更换配置应重新挂载。ref 暴露的实例可调用命令和动态增删插件，不要在组件挂载时主动 destroy。

JSON 数据绑定及事件见组件 API 页，完整生命周期见 [SDK 生命周期](/sdk/lifecycle)，持久化见 [数据与持久化](/sdk/document)。

::: info 下一步
- [插件体系](/sdk/plugin) 了解如何写插件
- [上传](/sdk/upload) 了解多场景上传
:::

## 核心概念

| 概念 | 说明 |
| --- | --- |
| **块（Block）** | 最小内容单元 `{ id, type, text, props? }` |
| **块类型（BlockTypeDef）** | 块协议：`parse`（Markdown → 块）、`serialize`（块 → Markdown）、`leaf` |
| **插件（DocumentEditorPlugin）** | 能力打包单元，在 `install(ctx)` 挂载扩展 |
| **扩展点** | 块类型 / 命令 / 渲染器 / 工具栏 / 右键菜单 / 导出器 / 上传器 / AI 操作 |
| **PluginManager** | 装载 / 卸载插件，聚合扩展点 |
| **Editor** | 编辑器引擎：块列表 + 多选 + undo/redo + 事件 |

## 选择接入方式

| 方式 | 适用场景 | 文档 |
| --- | --- | --- |
| DocEditor | 直接使用内置布局 | [一体化组件](./doc-editor) |
| ToolBar + Editor | 工具栏与编辑区分开放置，不需要 Provider | [工具栏](./tool-bar)、[编辑区](./editor) |

独立接入使用 `createDocEditorSession()` 关联同一组工具栏和编辑区，各组 session 互相独立。
