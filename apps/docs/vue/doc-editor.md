# DocEditor 文档编辑器（Vue 3）

块编辑器主组件：组装工具栏 + 画布 + 右键菜单 + AI 弹窗。

<script setup>
import Playground from '../components/Playground.vue'
</script>

<ClientOnly><Playground stack="vue" lock-stack /></ClientOnly>

文档编辑器组件名为 `DocEditor`。所有编辑器组件统一从 `@sword-editor/vue` 引入。

## 使用方式

`DocEditor` 是默认包含工具栏和编辑区的一体化组件。需要自由排列时，可使用独立 [ToolBar](./tool-bar) 和 [Editor](./editor)，无需 Provider。

## JSON 文档同步

```vue
<DocEditor v-model:document="document" @error="handleError" />
```

JSON 使用 SDK 的 `EditorDocument` 类型，保留块 ID、未知块、props 与 metadata。JSON 与 Markdown 同时传入时优先 JSON；同内容回传保留历史，不同内容视为文档切换并清空历史。省略数据属性时组件自行持有内容。插件、上传器、AI 和导出器配置当前在挂载时读取；更换配置请重新挂载组件。

样式需显式引入包的 `style.css`，无需在宿主安装 Tailwind。通过 `.sword-editor` 内 CSS 变量换肤；设置容器 `data-theme="dark"` 使用深色主题。`ariaLabel` 设置编辑器区域名称。

## Props

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `modelValue` | `string` | Markdown 字符串（v-model 双向绑定） |
| `document` | `EditorDocument` | 完整 JSON，优先于 Markdown |
| `ariaLabel` | `string` | 编辑器区域的可访问名称 |
| `title` | `string` | 文档标题（导出文件名） |
| `plugins` | `DocumentEditorPlugin[]` | 额外插件 |
| `blockRenderers` | `Record<string, Component>` | 自定义块渲染器：`type → 组件` |
| `uploaders` | `Uploader[]` | 图片 / 视频 / 附件上传器 |
| `exporters` | `Exporter[]` | 额外 / 覆盖的导出器 |
| `ai` | `DocEditorAi` | AI 适配器（`generate` / `polish` / `image`） |
| `resolveUrl` | `(url: string) => string` | 相对地址 → 完整 URL |
| `placeholder` | `string` | 空块占位文案 |
| `minHeight` / `maxHeight` | `number` | 画布高度范围，超长内部滚动 |
| `toolbar` | `boolean` | 是否显示顶部工具栏（默认 `true`） |
| `dir` | `string` | 上传目录（透传给上传器） |

## Events

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `update:document` | `EditorDocument` | JSON 内容变化，配合 v-model:document |
| `error` | `unknown` | 组件转发 SDK error 通知 |
| `update:modelValue` | `string` | 内容变化时输出 Markdown |

## 暴露的方法（`defineExpose`）

| 方法 | 说明 |
| --- | --- |
| `editor` | `Editor` 实例 |
| `toMarkdown()` | 当前块序列化为 Markdown |
| `insertBlock(type, index, focus?, text?)` | 在 `index` 后插入块 |
| `requestUpload(index, kind)` | 触发第 `index` 块的上传 |

## AI 适配器

AI 能力走插件体系，用配置即可接入（推荐）：

```ts
import { createAiAdapter } from '@sword-editor/vue'

const ai = createAiAdapter({
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-...',
  model: 'gpt-4o',
})
```

也可直接给函数适配器（三个均可选）：

```ts
interface DocEditorAi {
  generate?: (instruction: string) => Promise<string>
  polish?: (text: string, instruction: string) => Promise<string>
  image?: (instruction: string) => Promise<string>
}
```

注入后，右键菜单自动出现「AI 生成内容 / 修饰文本 / 生成图片」。详见 [AI 接入](/sdk/ai)。

## 拆分工具栏与编辑区

`DocEditor` 保留默认的一体化布局。通过默认插槽或 children 自定义布局时，默认工具栏与编辑区会被替换。`DocEditorProvider` 是同一组件的组合入口，负责创建实例、文档同步、插件、上传、AI 与资源清理；子组件共享它的选区与历史记录。

```vue
<script setup>
import { ref } from 'vue'
import { DocEditorProvider, ToolBar, DocEditorContent as Editor } from '@sword-editor/vue'
import '@sword-editor/vue/style.css'
const markdown = ref('')
</script>

<template>
  <DocEditorProvider v-model="markdown">
    <header><ToolBar /></header>
    <main><Editor :min-height="320" /></main>
  </DocEditorProvider>
</template>
```

`DocEditorContent` 为编辑区，示例将其本地命名为 `Editor`；包中的 `Editor` 仍是 SDK 类。高度配置传给编辑区，插件与文档配置传给容器。使用容器组合时，同一组工具栏和编辑区放在同一容器内；独立接入时通过 session 显式关联。


## 相关指南

- [Editor：编辑操作、快捷键与多实例](./editor)
- [ToolBar：文字格式、插入与导出](./tool-bar)
- [自定义块组件](./custom-blocks)
- [AI 接入](./ai)
