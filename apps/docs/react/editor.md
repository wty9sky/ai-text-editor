# Editor 编辑区

`Editor` 负责文档编辑、块渲染、选区、快捷键、右键菜单、上传与 AI 交互。通过 `DocEditorContent as Editor` 导入，避免与 SDK 的 `Editor` 类重名。

## 独立接入

无需 Provider。为编辑区与工具栏传入同一个稳定的 session；两者可以是兄弟组件，也可以放在页面不同位置。

```tsx
import { useState } from 'react'
import { createDocEditorSession, ToolBar, DocEditorContent as Editor } from '@sword-editor/react'
import '@sword-editor/react/style.css'

export function Document() {
  const [session] = useState(createDocEditorSession)
  const [markdown, setMarkdown] = useState('')
  return (
    <>
      <ToolBar session={session} />
      <Editor session={session} value={markdown} onChange={setMarkdown} minHeight={320} />
    </>
  )
}
```

## 配置与数据同步

插件、上传、AI、导出、自定义渲染器及文档配置均传给 `Editor`。`minHeight` / `maxHeight` 直接控制编辑区高度。独立模式不显示内置工具栏，由单独的 [ToolBar](./tool-bar) 提供。

独立模式支持与 [DocEditor](./doc-editor#props) 相同的文档与能力配置；`toolbar` 在独立模式固定关闭，自定义 children / 默认插槽不用于替换独立编辑区的内部布局。

## JSON 文档同步

```tsx
<DocEditor document={document} onDocumentChange={setDocument} onError={handleError} />
```

JSON 使用 SDK 的 `EditorDocument` 类型，保留块 ID、未知块、props 与 metadata。JSON 与 Markdown 同时传入时优先 JSON；同内容回传保留历史，不同内容视为文档切换并清空历史。省略数据属性时组件自行持有内容。插件、上传器、AI 和导出器配置当前在挂载时读取；更换配置请重新挂载组件。

样式需显式引入包的 `style.css`，无需在宿主安装 Tailwind。通过 `.sword-editor` 内 CSS 变量换肤；设置容器 `data-theme="dark"` 使用深色主题。`ariaLabel` 设置编辑器区域名称。

## 编辑操作与快捷键

正文使用 `contenteditable` 编辑区域，直接编辑段落、标题、列表、引用与代码块。Enter 拆分文本块，Shift+Enter 插入换行；代码块内 Enter 换行。中文组合输入完成后提交，粘贴只接收纯文本。撤销快捷键为 Ctrl/Cmd+Z，重做为 Ctrl/Cmd+Shift+Z。

在文本内第一次 Ctrl/Cmd+A 选择当前文本，700ms 内再次按下可选择全部块。Shift 点击连续选块，Ctrl/Cmd 点击切换单个块的选中状态；也可以在空白区域拖框多选。多选后，左键点击编辑器内或页面其他空白区域会取消多选；操作工具栏或菜单时保留选择。右键已选块保留多选，右键未选块切换目标，菜单平滑移动到新位置。菜单打开期间背景停止滚动，菜单内部仍可滚动。

块选择状态下，Backspace/Delete 批量删除所选块，Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做，Escape 清除块选择。普通文本编辑与标记为 `data-editor-interactive` 的自定义控件保留自身的键盘行为。

点击文本块或框选多个文本块后，工具栏可设置块类型、文字大小（10–96px 预设）、粗体、斜体、下划线和对齐，并提供插入、导出及插件按钮。格式作用于整个块或多个选中块，不是字符选区的行内富文本。没有选中文本块时，格式控件禁用。

样式保存在 `block.props.textStyle`，通过 `core.format` 命令写入，支持提交策略和撤销/重做。使用 JSON 文档同步保存完整样式；Markdown 仅承载文本结构，不保留字号、对齐等块级样式。


## 方法与事件

独立编辑区的 ref 暴露 `editor`、`toMarkdown`、`insertBlock`、`requestUpload`。事件与文档绑定方式见 [DocEditor](./doc-editor)。引用在组件挂载完成后读取；编辑区卸载后，内部 SDK 实例会销毁。

## 会话与多实例

每组编辑器创建一个 `createDocEditorSession()`，同一个 session 关联一个编辑区和一个工具栏。不要在 React 每次渲染时创建新 session，使用 `useState(createDocEditorSession)` 保持稳定。

工具栏单独卸载不会销毁文档，重新挂载可以继续操作。不同 session 的选区、历史记录和菜单相互独立。不要同时为同一个 session 挂载两个编辑区。

## 扩展块

自定义渲染器接收 SDK、块数据和操作函数，详见 [自定义块组件](./custom-blocks)。
