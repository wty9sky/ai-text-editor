# 上传

上传器按资源类别 `kind` 区分，落成对应块：`image` / `video` / `attachment`。

「主动上传（点按钮选文件）」与「被动上传（粘贴 / 拖拽）」是 UI 层语义，两者复用同一个 `Uploader`。

## 函数上传（OSS / 自有存储）

最通用的方式，`upload` 返回 `{ url, props?, name?, size?, mime? }`：

```ts
import { createFunctionUploader } from '@sword-editor/doc-editor'

const oss = createFunctionUploader({
  kind: 'image',
  label: '图片',
  accept: 'image/*',
  upload: async (file, options) => {
    // 这里换成 OSS SDK 直传 / 预签名 URL PUT
    const url = await ossClient.put(file, options.dir)
    return { url, name: file.name, size: file.size }
  },
})
```

## action 上传（固定地址）

```ts
import { createActionUploader } from '@sword-editor/doc-editor'

const attachment = createActionUploader({
  kind: 'attachment',
  action: '/api/upload',
  name: 'file',                 // 表单文件字段名
  resolve: resp => ({ url: resp.url, name: resp.name }),
})
```

## 传入组件

```vue
<script setup lang="ts">
const uploaders = [imageUploader, videoUploader, attachmentUploader]
</script>

<template>
  <DocEditor v-model="markdown" :uploaders="uploaders" dir="content" />
</template>
```

`dir` 会透传给 `upload` 的 `options.dir`。

## 多场景

| 场景 | 触发方式 | 说明 |
| --- | --- | --- |
| 主动上传 | 块内「上传」按钮 / 图片块占位 | 点按钮 → 文件选择器 |
| 被动上传 | 粘贴图片 / 拖拽文件 | 按文件类型自动匹配 `kind` |
| 函数上传 | `createFunctionUploader` | OSS / MinIO / 自有存储 |
| action 上传 | `createActionUploader` | POST 固定地址 |

## 自定义 Uploader 协议

```ts
interface Uploader {
  id: string
  kind: 'image' | 'video' | 'attachment'
  label: string
  accept?: string
  upload: (file: File, options: { dir?: string }) => Promise<UploadResult>
}
```

## 取消与目标校验

上传配置还包含 `signal?: AbortSignal` 与 `onProgress?: (loaded: number, total: number) => void`。自定义上传函数应把 signal 传给 fetch；进度是否可用取决于上传实现，当前不是所有上传器都会报告进度。

SDK 的 `uploadFile(editor, file, options)` 统一负责目标捕获和提交：文档切换、目标块变更、上传器卸载/替换后，迟到结果不会写入。上传成功的远端资源不会因本地撤销自动删除，资源回收由宿主管理。详见 [生命周期](/sdk/lifecycle)。

组件场景从 `@sword-editor/vue` / `@sword-editor/react` 导入上传工厂与 Uploader 类型，无需额外安装 SDK。
