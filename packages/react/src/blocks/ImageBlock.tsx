import type { Block } from '@sword-editor/doc-editor'
import { useDocEditor } from '../context.js'

export function ImageBlock({ block, index }: { block: Block, index: number }) {
  const { editor, uploaders, resolveUrl, requestUpload } = useDocEditor()
  const uploader = uploaders.find(u => u.kind === 'image')

  if (block.text) {
    return (
      <div className="group relative inline-block py-1">
        <img src={resolveUrl(block.text)} alt={block.alt || '图片'} className="max-h-80 max-w-full rounded-lg border border-(--line)" />
        <div className="absolute right-1.5 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {uploader && (
            <button type="button" className="rounded bg-(--panel) px-2 py-0.5 text-[11px] shadow" onClick={() => requestUpload(index, 'image')}>
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
          onClick={() => requestUpload(index, 'image')}
        >
          <span className="text-[18px]">＋</span>
          上传图片
        </button>
      )}
      <input
        value={block.text}
        placeholder="或粘贴图片地址"
        className="h-8 w-64 rounded-md border border-(--line) bg-transparent px-2 text-[12px] outline-none"
        onChange={e => editor.update(block.id, { text: e.target.value })}
      />
    </div>
  )
}
