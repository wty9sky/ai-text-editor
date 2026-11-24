# AI 接入

AI 能力统一走插件体系：插件注册 **AiAction**，右键菜单自动出现入口，弹窗交互由组件层渲染。本页是**框架无关**的核心内容，组件接入示例见 [Vue](/vue/ai) 与 [React](/react/ai)。

## 方式一：配置接入（推荐）

用 `createAiAdapter` 一份配置即可接入 OpenAI 兼容的大模型：

```ts
import { createAiAdapter } from '@sword-editor/doc-editor'

const ai = createAiAdapter({
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-...',
  model: 'gpt-4o',
  systemPrompt: '你是资深编辑，输出简洁专业的中文。',
  imageModel: 'dall-e-3',
})

// 组件层注入：
// Vue:   <DocEditor v-model="markdown" :ai="ai" />
// React: <DocEditor value={markdown} onChange={setMarkdown} ai={ai} />
```

覆盖 DeepSeek / Moonshot / 通义 / 本地 Ollama 等兼容服务：

```ts
const ai = createAiAdapter({
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  apiKey: import.meta.env.VITE_DEEPSEEK_KEY,
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

直接给三个函数（均可选，只注入需要的）：

```ts
const ai = {
  generate: (instruction: string) => Promise.resolve('# 生成结果'),
  polish: (text: string, instruction: string) => Promise.resolve(text),
  image: (instruction: string) => Promise.resolve('/img.png'),
}
```

## 方式三：自定义 AiAction（插件）

```ts
import { definePlugin } from '@sword-editor/doc-editor'
import type { AiAction } from '@sword-editor/doc-editor'

const myAi: AiAction = {
  id: 'ai.translate',
  label: 'AI 翻译',
  icon: 'sparkles',
  kind: 'polish', // 复用「原文 + 结果替换」交互
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
```

## AI 结果应用规则

插件未提供 `apply` 时，按 `kind` 走内置逻辑：

| kind | 结果字段 | 应用方式 |
| --- | --- | --- |
| `generate` | `text`（Markdown） | 转为块列表，插入触发块处 |
| `polish` | `text` | 替换触发块的文本 |
| `image` | `image`（地址） | 在触发块后插入图片块 |

## 会话、取消和冲突

当前 `AiSession` 在创建时捕获文档会话与目标块，run 返回后和 apply 前均检查有效性。切换文档、修改目标、卸载/替换 AI 能力或 dispose 后，旧结果不能写回。默认 apply 使用同步事务，一次应用对应一个撤销步骤。

AiSession 已接入 beforePrepare、prepareContext、beforeRun、afterRun、beforeApply、applied、error/cancelled 钩子。prepareContext 返回插件命名空间 JSON 补丁，第四个构造参数可传 signal 与 timeoutMs。约定见 [钩子与发布订阅](/sdk/hooks)。输出由 SDK 校验，权限通过宿主能力门禁控制。取消不保证远端请求撤销。详见 [生命周期](/sdk/lifecycle)。

浏览器组件建议通过自有后端调用模型，长期密钥保留在服务端。createAiAdapter 可用于受信任环境或由宿主代理的协议适配；组件项目从对应 vue/react 包导入即可。
