import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'

// 侧边栏复用片段：
// 第一级「核心 SDK」（框架无关，始终可见）
const coreSdkItems = [
  { text: '概述', link: '/sdk/' },
  { text: '插件架构与契约', link: '/sdk/plugin-guide' },
  { text: '插件示例：删除与撤销', link: '/sdk/plugin-example' },
  { text: '插件消息通道', link: '/sdk/messages' },
  { text: '托管资源与超时', link: '/sdk/resources' },
  { text: '性能与安全边界', link: '/sdk/plugin-boundaries' },
  { text: '钩子与发布订阅', link: '/sdk/hooks' },
  { text: '生命周期与资源清理', link: '/sdk/lifecycle' },
  { text: '数据与持久化', link: '/sdk/document' },
  { text: 'Editor 引擎', link: '/sdk/editor' },
  { text: '插件体系', link: '/sdk/plugin' },
  { text: '扩展点', link: '/sdk/extension-points' },
  { text: '上传', link: '/sdk/upload' },
  { text: 'AI 接入', link: '/sdk/ai' },
]
// 框架组件目录按阅读任务分组，SDK 资料放在组件指南之后。
function componentSidebar(framework: 'vue' | 'react') {
  const link = (page: string) => `/${framework}/${page}`
  return [
    {
      text: '基础',
      collapsed: false,
      items: [
        {
          text: '安装与快速开始',
          link: link('getting-started'),
        },
        { text: '数据与持久化', link: '/sdk/document' },
      ],
    },
    {
      text: '组件',
      collapsed: false,
      items: [
        {
          text: 'ToolBar 工具栏',
          link: link('tool-bar'),
        },
        {
          text: 'Editor 编辑区',
          link: link('editor'),
        },
        {
          text: 'DocEditor 一体化编辑器',
          link: link('doc-editor'),
        },
      ],
    },
    {
      text: '配置与 API',
      collapsed: false,
      items: [
        { text: '工具栏配置', link: `${link('tool-bar')}#props` },
        { text: '编辑器配置', link: `${link('editor')}#配置与数据同步` },
        { text: '组件 API', link: `${link('doc-editor')}#props` },
        { text: 'SDK Editor API', link: '/sdk/editor' },
        { text: '上传与资源', link: '/sdk/upload' },
        {
          text: 'AI 接入',
          link: link('ai'),
        },
      ],
    },
    {
      text: '高级',
      collapsed: false,
      items: [
        {
          text: '自定义块组件',
          link: link('custom-blocks'),
        },
        { text: '会话与多实例', link: `${link('editor')}#会话与多实例` },
        { text: '插件架构与契约', link: '/sdk/plugin-guide' },
        { text: '钩子与发布订阅', link: '/sdk/hooks' },
        { text: '生命周期与清理', link: '/sdk/lifecycle' },
      ],
    },
    { text: '核心 SDK', collapsed: true, items: coreSdkItems },
  ]
}

export default defineConfig({
  lang: 'zh-CN',
  title: '图文编辑器',
  description: '以块为基座的图文内容编辑器：文本 / 图片 / 视频 / 代码 / 附件，插件化架构，Vue 3 / React 双端组件',
  lastUpdated: true,
  cleanUrls: true,
  // GitHub Pages 子路径部署；自定义域名时构建时设置 DOCS_BASE=/
  base: process.env.DOCS_BASE || '/',
  // 显式开启深色模式切换（顶部太阳 / 月亮图标）
  appearance: true,

  vite: {
    plugins: [
      tailwindcss(),
      {
        // Keep the runtime barrel and StateEditor implementation in one client chunk.
        name: 'playground-runtime-chunk',
        config(_config, env) {
          if (env.isSsrBuild)
            return
          return {
            build: {
              rollupOptions: {
                output: {
                  manualChunks(id: string) {
                    if (id.includes('/packages/runtime/'))
                      return 'editor-runtime'
                  },
                },
              },
            },
          }
        },
      },
    ],
    resolve: {
      alias: {
        // 文档站直接跑源码，开发时热更新
        '@sword-editor/vue': fileURLToPath(new URL('../../../packages/vue/src/index.ts', import.meta.url)),
        '@sword-editor/react': fileURLToPath(new URL('../../../packages/react/dist/index.js', import.meta.url)),
      },
    },
  },

  themeConfig: {
    nav: [
      { text: '文档编辑器', link: '/vue/getting-started', activeMatch: '^/(sdk|vue|react)/' },
      { text: '图片编辑器', link: '/editors/image' },
      { text: '无限画布编辑器', link: '/editors/canvas' },
      { text: 'Playground', link: '/playground', activeMatch: '^/playground(?:/|$)' },
    ],
    sidebar: {
      // SDK 与框架组件属于同一套文档导航。
      '/sdk/': componentSidebar('vue'),
      '/vue/': componentSidebar('vue'),
      '/react/': componentSidebar('react'),
      '/editors/image': [
        {
          text: '图片编辑器',
          items: [
            { text: '概述', link: '/editors/image' },
          ],
        },
      ],
      '/editors/canvas': [
        {
          text: '无限画布编辑器',
          items: [
            { text: '概述', link: '/editors/canvas' },
          ],
        },
      ],
    },
    socialLinks: [],
    footer: {
      message: '@sword-editor/doc-editor · Vue 3 / React',
    },
  },
})
