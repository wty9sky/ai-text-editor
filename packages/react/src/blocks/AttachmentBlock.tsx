import type { Block } from '@sword-editor/doc-editor'
import { File } from 'lucide-react'
import { useDocEditor } from '../context.js'

export function AttachmentBlock({ block, index }: { block: Block, index: number }) {
  const { editor, uploaders, resolveUrl, requestUpload } = useDocEditor()
  const uploader = uploaders.find(u => u.kind === 'attachment')

  const name = (block.props?.name as string)
    || block.text.split('/').filter(Boolean).pop()
    || '附件'

  if (block.text) {
    return (
      <div className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-(--line) bg-(--panel-2) px-3 py-2">
        <File className="size-4 flex-none text-(--ink-3)" />
        <a
          href={resolveUrl(block.text)}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-xs truncate text-[13px] text-(--accent-ink) hover:underline"
        >
          {name}
        </a>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {uploader && (
            <button type="button" className="rounded bg-(--panel) px-2 py-0.5 text-[11px] shadow" onClick={() => requestUpload(index, 'attachment')}>
              更换
            </button>
          )}
          <button type="button" className="rounded bg-(--panel) px-2 py-0.5 text-[11px] text-(--down) shadow" onClick={() => editor.remove([block.id])}>
            移除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1">
      {uploader && (
        <button
          type="button"
          className="flex h-20 w-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-(--line) text-[12px] text-(--ink-3) transition-colors hover:bg-(--panel-2)"
          onClick={() => requestUpload(index, 'attachment')}
        >
          <span className="text-[18px]">＋</span>
          上传附件
        </button>
      )}
      <input
        value={block.text}
        placeholder="或粘贴文件地址"
        className="h-8 w-64 rounded-md border border-(--line) bg-transparent px-2 text-[12px] outline-none"
        onChange={e => editor.update(block.id, { text: e.target.value })}
      />
    </div>
  )
}
