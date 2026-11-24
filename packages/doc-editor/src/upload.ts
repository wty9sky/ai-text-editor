/**
 * 上传工厂：把不同的上传实现统一成 Uploader 扩展点
 *
 * - 函数上传（createFunctionUploader）：调用方给一个 `(file, options) => Promise<UploadResult>`，
 *   内部对接 OSS / MinIO / 自有存储。这是最通用的场景；
 * - action 上传（createActionUploader）：POST 文件到固定 action 地址（表单字段名、请求头可配）。
 *
 * 主动 / 被动上传是 UI 层语义（点按钮选文件 vs 粘贴 / 拖拽），两者复用同一个 Uploader。
 */
import type { Uploader, UploadKind, UploadOptions, UploadResult } from './extensions.js'

export interface FunctionUploaderConfig {
  id?: string
  label?: string
  kind: UploadKind
  accept?: string
  upload: (file: File, options: UploadOptions) => Promise<UploadResult>
}
/** 函数上传：适配 OSS / MinIO / 自有存储（最通用） */
export function createFunctionUploader(config: FunctionUploaderConfig): Uploader {
  return {
    id: config.id ?? `upload.${config.kind}`,
    label: config.label ?? config.kind,
    kind: config.kind,
    accept: config.accept,
    upload: config.upload,
  }
}
export interface ActionUploaderConfig {
  id?: string
  label?: string
  kind: UploadKind
  /** 上传地址 */
  action: string
  /** 表单文件字段名，默认 file */
  name?: string
  /** 额外表单字段 */
  data?: Record<string, string>
  /** 请求头 */
  headers?: Record<string, string>
  /** 是否携带跨域凭据 */
  withCredentials?: boolean
  accept?: string
  /** 从响应里取回 url（默认直接拿 resp.url） */
  resolve?: (resp: any) => UploadResult | Promise<UploadResult>
}
/** action 上传：POST 文件到固定地址 */
export function createActionUploader(config: ActionUploaderConfig): Uploader {
  const resolve = config.resolve ?? ((resp: any) => ({
    url: String(resp?.url ?? ''),
  }))
  return {
    id: config.id ?? `upload.${config.kind}`,
    label: config.label ?? config.kind,
    kind: config.kind,
    accept: config.accept,
    upload: (file, options) => new Promise<UploadResult>((resolveFn, reject) => {
      const form = new FormData()
      form.append(config.name ?? 'file', file)
      if (config.data) {
        for (const [k, v] of Object.entries(config.data))
          form.append(k, v)
      }
      const xhr = new XMLHttpRequest()
      if (options.signal?.aborted) {
        reject(options.signal.reason)
        return
      }
      const abort = () => {
        xhr.abort()
        reject(options.signal?.reason ?? new Error('Upload aborted'))
      }
      options.signal?.addEventListener('abort', abort, { once: true })
      xhr.onloadend = () => options.signal?.removeEventListener('abort', abort)
      xhr.onabort = () => reject(new Error('Upload aborted'))
      xhr.open('POST', config.action)
      xhr.withCredentials = config.withCredentials ?? false
      if (config.headers) {
        for (const [k, v] of Object.entries(config.headers))
          xhr.setRequestHeader(k, v)
      }
      if (options.onProgress) {
        xhr.upload.onprogress = e => options.onProgress!(e.loaded, e.total || file.size)
      }
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText)
            resolveFn(await resolve(resp))
          }
          catch {
            reject(new Error(`上传失败（${xhr.status}）`))
          }
        }
        else {
          reject(new Error(`上传失败（${xhr.status}）`))
        }
      }
      xhr.onerror = () => reject(new Error('网络错误，上传失败'))
      xhr.send(form)
    }),
  }
}
