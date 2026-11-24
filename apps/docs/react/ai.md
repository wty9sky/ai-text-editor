# AI 接入（React）

AI 能力统一走插件体系：插件注册 **AiAction**，右键菜单自动出现入口，弹窗交互由组件层渲染。AI 操作通过统一的 SDK 接口执行。

## 方式一：配置接入（推荐）

用 `createAiAdapter` 一份配置即可接入 OpenAI 兼容的大模型，无需手写请求：

```tsx
import { DocEditor } from '@sword-editor/react'
import { createAiAdapter } from '@sword-editor/react'

const ai = createAiAdapter({
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-...',
  model: 'gpt-4o',
  systemPrompt: '你是资深编辑，输出简洁专业的中文。',
  imageModel: 'dall-e-3',
})

export default () => (
  <DocEditor value={markdown} onChange={setMarkdown} ai={ai} />
)
```

覆盖 DeepSeek / Moonshot / 通义 / 本地 Ollama 等兼容服务：

```ts
const ai = createAiAdapter({
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  apiKey: process.env.DEEPSEEK_KEY!,
  model: 'deepseek-chat',
})
```

### 配置项 `AiClientConfig`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `endpoint` | `string` | chat/completions 端点（必填） |
| `apiKey` | `string` | API Key（`Authorization: Bearer`） |
| `model` | `string` | 模型名（必填） |
| `headers` | `Record<string, string>` | 额外请求头 |
| `systemPrompt` | `string` | 系统提示词 |
| `fetch` | `typeof fetch` | 自定义 fetch（SSR / 代理 / 测试） |
| `imageEndpoint` | `string` | 图片生成端点，缺省由 endpoint 推导 |
| `imageModel` | `string` | 图片模型，默认 `dall-e-3` |
| `imageSize` | `string` | 图片尺寸，默认 `1024x1024` |

## 方式二：函数适配器

不想依赖 OpenAI 兼容协议，直接给三个函数（均可选，只注入需要的）：

```tsx
const ai = {
  generate: (instruction: string) => Promise.resolve('# 生成结果'),
  polish: (text: string, instruction: string) => Promise.resolve(text),
  image: (instruction: string) => Promise.resolve('/img.png'),
}

<DocEditor ai={ai} />
```

## 方式三：自定义 AiAction（插件）

注册自己的 AI 操作，自定义执行与结果应用：

```tsx
import { definePlugin } from '@sword-editor/react'
import type { AiAction } from '@sword-editor/react'

const myAi: AiAction = {
  id: 'ai.translate',
  label: 'AI 翻译',
  icon: 'sparkles',
  kind: 'polish',
  run: async ({ block, instruction }) => ({
    text: await translate(block?.text ?? '', instruction),
  }),
}

const plugin = definePlugin({
  name: 'my.ai',
  install(ctx) {
    ctx.registerAiAction(myAi)
  },
})

<DocEditor plugins={[plugin]} />
```

## AI 结果应用规则

插件未提供 `apply` 时，按 `kind` 走内置逻辑：

| kind | 结果字段 | 应用方式 |
| --- | --- | --- |
| `generate` | `text`（Markdown） | 转为块列表，插入触发块处 |
| `polish` | `text` | 替换触发块的文本 |
| `image` | `image`（地址） | 在触发块后插入图片块 |
