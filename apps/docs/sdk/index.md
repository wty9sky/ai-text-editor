# SDK 概述


`@sword-editor/doc-editor` 是**框架无关的块编辑器核心 SDK**：不含任何 UI，只提供数据模型、编辑器引擎、插件体系与 Markdown 双向转换。Vue 3 与 React 组件都构建在它之上——插件、扩展点、上传器、AI 适配器全部两端共用。

## 选择安装方式

使用 Vue 组件只安装 `@sword-editor/vue`，使用 React 组件只安装 `@sword-editor/react`。组件产物内置文档 SDK、runtime、图标及导出依赖，仅框架由宿主提供。插件工厂、类型与 Editor 均可从对应组件包导入。

```bash
# 在已有 Vue ^3.5 项目中
pnpm add @sword-editor/vue
# 或在已有 React 18+ / ReactDOM 项目中
pnpm add @sword-editor/react
```

仅在不使用组件、单独操作数据与命令时安装 headless SDK：

```bash
pnpm add @sword-editor/doc-editor
```

组件包与独立 SDK 分别持有自己的内核副本。组件扩展请从同一组件包导入，避免混用不同入口的类身份（例如 instanceof）判断。SDK API 不依赖框架，领域插件逻辑可复用；渲染器分别使用 Vue 或 React 组件。

## 分层架构

[![SDK 分层架构](/diagrams/sdk-layers.svg)](/diagrams/sdk-layers.svg)

组件层负责渲染与交互（工具栏 / 右键菜单 / 弹窗），核心层负责一切逻辑。**写一次插件，两端生效**。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| **块（Block）** | 最小内容单元 `{ id, type, text, props? }`，一切操作都以块为单位 |
| **块类型（BlockTypeDef）** | 块协议：`parse`（Markdown → 块）、`serialize`（块 → Markdown）、`leaf` |
| **插件（DocEditorPlugin）** | 能力打包单元，在 `install(ctx)` 里向扩展点注册 |
| **扩展点** | 块类型 / 命令 / 渲染器 / 工具栏 / 右键菜单 / 导出器 / 上传器 / AI 操作 |
| **PluginManager** | 装载 / 卸载插件，聚合全部扩展点 |
| **Editor** | 编辑器引擎：块列表 + 多选 + undo/redo + 事件 |

## 最小示例

不经过组件层，直接在 Node / 任意环境使用核心 SDK：

```ts
import { Editor, markdownToBlocks, blocksToMarkdown, definePlugin } from '@sword-editor/doc-editor'

const md = '# 标题\n\n一段正文'

// Markdown → 块 → Markdown 双向转换
const blocks = markdownToBlocks(md)
const back = blocksToMarkdown(blocks)

// 无 UI 也能驱动编辑器引擎
const editor = new Editor({ plugins: [] })
editor.setBlocks(blocks) // 新会话，清空历史
editor.update(editor.blocks[0].id, { text: '修改后的内容' })
editor.undo() // 撤销上面的编辑
editor.destroy()

// 插件扩展块类型
const callout = definePlugin({
  name: 'demo.callout',
  install(ctx) {
    ctx.registerBlockType({
      type: 'callout',
      label: '提示框',
      leaf: true,
      parse: lines => null,
      serialize: b => b.text,
    })
  },
})
```

## 内置能力一览

- **12 类内置块**：文本、标题 H1–H3、有序 / 无序列表、引用、代码块、图片、视频、附件、分割线
- **Markdown 双向转换**：`markdownToBlocks` / `blocksToMarkdown` / `markdownToHtml`
- **上传器工厂**：`createFunctionUploader`（OSS 直传）/ `createActionUploader`（固定地址）
- **AI 适配器**：`createAiAdapter` 一份配置接入 OpenAI 兼容大模型，或手写 `AiAdapter` 纯函数
- **导出器**：md / docx / pdf / png，可插件扩展

## 文档目录

| 章节 | 内容 |
| --- | --- |
| [钩子与发布订阅](/sdk/hooks) | 类型化决策、具名通知、AI 准备与诊断 |
| [生命周期与资源清理](/sdk/lifecycle) | SDK 状态、插件作用域、取消、安装回滚与销毁 |
| [数据与持久化](/sdk/document) | JSON 校验、冻结快照、会话切换与受控同步 |
| [Editor 引擎](/sdk/editor) | 块操作、多选、undo/redo、事件订阅 |
| [插件体系](/sdk/plugin) | `definePlugin` 与八类扩展点 |
| [扩展点](/sdk/extension-points) | 各扩展点的类型与完整示例 |
| [上传](/sdk/upload) | 函数上传 / action 上传，主动与被动 |
| [AI 接入](/sdk/ai) | 配置接入 / 函数适配器 / 自定义 AiAction |

组件层的框架接入见 [Vue 文档](/vue/getting-started) 与 [React 文档](/react/getting-started)。

## 插件协议与能力边界

完整接入流程见[插件架构与契约](/sdk/plugin-guide)：使用 `defineExtension` 定义 `name/version/apply/dispose` 协议，以受限 API 门面访问文档与命令；原生 `definePlugin` 继续支持渲染器等完整扩展点。Vue / React 使用者从各自组件包导入这些 API，无需额外安装 SDK。

插件间通知使用[消息通道](/sdk/messages)，核心决策使用[生命周期钩子](/sdk/hooks)。定时器、DOM 监听与自定义清理由[托管资源](/sdk/resources)管理；异步 `ai:prepareContext` 支持单钩子 `timeoutMs`。实际权限、性能与隔离限制见[能力边界](/sdk/plugin-boundaries)。
