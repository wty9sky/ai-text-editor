# @sword-editor/react

react 编辑器组件库。提供文档编辑器 `DocEditor` 和图片编辑器 `ImageEditor`。

```ts
import { DocEditor } from '@sword-editor/react'
import '@sword-editor/react/style.css'
```

依赖 Node >=22.12，React / ReactDOM >=18。提供 ESM 和 TypeScript 声明。浏览器编辑界面依赖 DOM；React 在 effect 中初始化，Vue 在客户端挂载编辑器，SSR 应使用 ClientOnly。上传/导出等浏览器能力需客户端调用。

JSON 受控接口：`document` / `onDocumentChange`。Markdown 接口继续兼容。JSON 优先，外部内容替换清空历史，相同内容回传不清空历史。配置属性在挂载时读取。完整示例见 apps/docs。

## 内置 SDK

只安装本组件包即可，文档 SDK、runtime 与导出依赖已经打包，不要求安装 @sword-editor/doc-editor。Editor、definePlugin、createFunctionUploader、EditorDocument、DocumentEditorPlugin 等从本包直接导入；框架为 peer dependency，需由宿主提供。类型声明同样内联，不依赖外置 SDK 声明文件。

组件创建并销毁自己的实例；ref 暴露实例供操作，请勿在挂载期间主动 destroy。JSON 发生外部替换会开启新会话并清空历史；相同内容回传保留历史。生命周期详情见 apps/docs/sdk/lifecycle.md。
