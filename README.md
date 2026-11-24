# Sword Editor

框架无关的编辑器 SDK 与 Vue 3 / React 组件库。

| 目录 | npm 包 | 职责 |
| --- | --- | --- |
| packages/runtime | @sword-editor/runtime | 公共插件运行时 |
| packages/doc-editor | @sword-editor/doc-editor | 文档模型、命令、历史与导出 |
| packages/canvas-editor | @sword-editor/canvas-editor | 画布 SDK |
| packages/image-editor | @sword-editor/image-editor | 图片 SDK |
| packages/vue | @sword-editor/vue | Vue 3 编辑器组件集合 |
| packages/react | @sword-editor/react | React 编辑器组件集合 |
| apps/docs | 不发布 | SDK 与两套框架组件文档、Playground |

组件包内置文档 SDK、runtime、图标与导出依赖，在已有框架项目中只需安装对应组件包。Editor、插件工厂与类型可从同一个组件包导入。

组件库提供 DocEditor 和 ImageEditor。SDK 的格式标识保持既有 site.*，保留文档兼容性。

```sh
pnpm install
pnpm docs:dev
pnpm release:check
pnpm test:browser
```

Node >=22.12，pnpm >=10。浏览器测试默认使用 macOS Google Chrome，可通过 CHROME_PATH 设置可执行文件路径。

组件支持 JSON 文档与原有 Markdown 同步；样式从对应包的 style.css 显式引入。详情见 apps/docs/vue/doc-editor.md、apps/docs/react/doc-editor.md。

GitHub 部署（文档站 Pages、CI、NPM 发布）、首次提交到 GitHub 的流程，以及混淆 SDK 的 NPM 打包方案见 docs/github-and-npm.md。本次发布范围仅含文档 / 图片编辑器的 SDK 与 Vue / React 组件（runtime、doc-editor、image-editor、vue、react），暂不包含无限画布；SDK 的 dist JS 构建后混淆，.d.ts 与具名导出保持原样，可照常 import。

首轮已补充 JSON 同步、统一容器主题、组件页真实示例和发布检查。外部实例所有权、动态配置、只读交互、隔离权限沙箱、画布/图片 UI 仍待后续开发。尚未正式发布 npm。

文档 SDK 已加入类型化生命周期/命令/事务/AI 钩子、具名发布订阅、依赖 SemVer/拓扑预检和有限诊断。详情见 apps/docs/sdk/hooks.md。旧 editor.on 保留兼容，通知分发期间禁止重入修改。
