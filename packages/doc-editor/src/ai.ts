/**
 * AI 扩展点工厂：把使用方注入的 AI 适配器包装成标准 AiAction
 *
 * AiAdapter 是框架无关的纯函数（对接具体后端），createAiActions 据此生成
 * 生成内容 / 修饰文本 / 生成图片 三个标准操作，注册进插件体系后，
 * UI 层（React / Vue）自动呈现右键菜单与弹窗交互，不再需要硬编码 AI 行为。
 */
import type { AiAction, AiAdapter } from './extensions.js'
/**
 * AI 客户端配置：通过「配置」而非「手写函数」接入大模型。
 * 面向 OpenAI 兼容的 chat/completions 与 images/generations 接口，
 * 覆盖大多数厂商（OpenAI / DeepSeek / Moonshot / 通义 / 本地 Ollama 等）。
 */
export interface AiClientConfig {
  /** chat/completions 端点，如 https://api.openai.com/v1/chat/completions */
  endpoint: string
  /** API Key（Authorization: Bearer） */
  apiKey: string
  /** 模型名，如 gpt-4o / deepseek-chat */
  model: string
  /** 额外请求头 */
  headers?: Record<string, string>
  /** 系统提示词（可选，用于约束风格 / 角色） */
  systemPrompt?: string
  /** 自定义 fetch 实现（SSR / 代理 / 单测注入） */
  fetch?: typeof fetch
  /** 图片生成端点；缺省时由 endpoint 的 /chat/completions 推导为 /images/generations */
  imageEndpoint?: string
  /** 图片模型，如 dall-e-3 */
  imageModel?: string
  /** 图片尺寸，如 1024x1024 */
  imageSize?: string
}
interface ChatMessage {
  role: 'system' | 'user'
  content: string
}
/** 用一份配置生成 AI 适配器（generate / polish / image），直接交给编辑器 `ai` prop */
export function createAiAdapter(config: AiClientConfig): AiAdapter {
  const f = config.fetch ?? globalThis.fetch
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    ...config.headers,
  }
  async function chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const res = await f(config.endpoint, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({ model: config.model, messages, temperature: 0.7 }),
    })
    if (!res.ok)
      throw new Error(`AI 请求失败（${res.status}）`)
    const data: any = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string')
      throw new TypeError('AI 响应格式异常：缺少 choices[0].message.content')
    return text.trim()
  }
  async function genImage(instruction: string, options?: {
    signal?: AbortSignal
  }): Promise<string> {
    const endpoint = config.imageEndpoint
      ?? config.endpoint.replace(/\/chat\/completions$/, '/images/generations')
    const res = await f(endpoint, {
      method: 'POST',
      signal: options?.signal,
      headers,
      body: JSON.stringify({
        model: config.imageModel ?? 'dall-e-3',
        prompt: instruction,
        n: 1,
        size: config.imageSize ?? '1024x1024',
        response_format: 'b64_json',
      }),
    })
    if (!res.ok)
      throw new Error(`AI 图片生成失败（${res.status}）`)
    const data: any = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    const url = data?.data?.[0]?.url
    if (b64)
      return `data:image/png;base64,${b64}`
    if (url)
      return url
    throw new Error('AI 图片响应格式异常：缺少 data[0].b64_json / url')
  }
  const sys: ChatMessage[] = config.systemPrompt
    ? [
        { role: 'system', content: config.systemPrompt },
      ]
    : []
  return {
    generate: (instruction, options) => chat([
      ...sys,
      { role: 'user', content: `请根据以下要求生成内容，用 Markdown 输出（不要多余说明）：\n${instruction}` },
    ], options?.signal),
    polish: (text, instruction, options) => chat([
      ...sys,
      {
        role: 'user',
        content: `请根据要求润色以下文本，只输出润色后的文本（不要任何说明）：\n\n要求：${instruction || '更流畅、更专业'}\n\n原文：\n${text}`,
      },
    ], options?.signal),
    image: genImage,
  }
}
/** 把 AI 适配器包装成标准操作（只生成适配器实际提供的操作） */
export function createAiActions(adapter: AiAdapter): AiAction[] {
  const actions: AiAction[] = []
  if (adapter.generate) {
    actions.push({
      id: 'ai.generate',
      label: 'AI 生成内容',
      icon: 'sparkles',
      kind: 'generate',
      run: async ({ instruction, signal }) => ({
        text: await adapter.generate!(instruction, { signal }),
      }),
    })
  }
  if (adapter.polish) {
    actions.push({
      id: 'ai.polish',
      label: 'AI 修饰文本',
      icon: 'sparkles',
      kind: 'polish',
      run: async ({ block, instruction, signal }) => ({
        text: block?.text.trim()
          ? await adapter.polish!(block.text, instruction, { signal })
          : '',
      }),
    })
  }
  if (adapter.image) {
    actions.push({
      id: 'ai.image',
      label: 'AI 生成图片',
      icon: 'sparkles',
      kind: 'image',
      run: async ({ instruction, signal }) => ({
        image: await adapter.image!(instruction, { signal }),
      }),
    })
  }
  return actions
}
