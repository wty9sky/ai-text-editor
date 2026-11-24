# AI 接入（Vue）

AI 能力统一走插件体系：插件注册 **AiAction**，右键菜单自动出现入口，弹窗交互由组件层渲染。适配器本身是框架无关的，配置项与高级用法见 [SDK · AI 接入](/sdk/ai)。

## 方式一：配置接入（推荐）

用 `createAiAdapter` 一份配置即可接入 OpenAI 兼容的大模型，无需手写请求：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DocEditor } from '@sword-editor/vue'
import { createAiAdapter } from '@sword-editor/vue'

const markdown = ref('# 你好')

const ai = createAiAdapter({
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-...',
  model: 'gpt-4o',
  systemPrompt: '你是资深编辑，输出简洁专业的中文。',
  imageModel: 'dall-e-3',
})
</script>

<template>
  <DocEditor v-model="markdown" :ai="ai" />
</template>
```

覆盖 DeepSeek / Moonshot / 通义 / 本地 Ollama 等兼容服务：

```ts
const ai = createAiAdapter({
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  apiKey: import.meta.env.VITE_DEEPSEEK_KEY,
  model: 'deepseek-chat',
})
```

## 方式二：函数适配器

不想依赖 OpenAI 兼容协议，直接给三个函数（均可选，只注入需要的）：

```vue
<script setup lang="ts">
const ai = {
  generate: (instruction: string) => Promise.resolve('# 生成结果'),
  polish: (text: string, instruction: string) => Promise.resolve(text),
  image: (instruction: string) => Promise.resolve('/img.png'),
}
</script>

<template>
  <DocEditor v-model="markdown" :ai="ai" />
</template>
```

## 方式三：自定义 AiAction（插件）

注册自己的 AI 操作，自定义执行与结果应用（完整 `AiAction` 类型见 [SDK · AI 接入](/sdk/ai#方式三：自定义-aiaction-插件)）：

```vue
<script setup lang="ts">
import { DocEditor } from '@sword-editor/vue'
import { definePlugin } from '@sword-editor/vue'
import type { AiAction } from '@sword-editor/vue'

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
</script>

<template>
  <DocEditor v-model="markdown" :plugins="[plugin]" />
</template>
```
