import type { Block } from '@sword-editor/doc-editor'
import { useDocEditor } from '../context.js'

export function VideoBlock({ block, index }: { block: Block, index: number }) {
  const { editor, uploaders, resolveUrl, requestUpload } = useDocEditor()
  const uploader = uploaders.find(u => u.kind === 'video')

  if (block.text) {
    return (
      <div className="group relative inline-block w-full max-w-xl py-1">
        <video
          src={resolveUrl(block.text)}
          poster={block.props?.poster
            ? resolveUrl(block.props.poster as string)
            : undefined}
          controls
          className="max-h-80 w-full rounded-lg border border-(--line)"
        />
        <div className="absolute right-1.5 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {uploader && (
            <button type="button" className="rounded bg-(--panel) px-2 py-0.5 text-[11px] shadow" onClick={() => requestUpload(index, 'video')}>
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
          onClick={() => requestUpload(index, 'video')}
        >
          <span className="text-[18px]">＋</span>
          上传视频
        </button>
      )}
      <input
        value={block.text}
        placeholder="或粘贴视频地址"
        className="h-8 w-64 rounded-md border border-(--line) bg-transparent px-2 text-[12px] outline-none"
        onChange={e => editor.update(block.id, { text: e.target.value })}
      />
    </div>
  )
}
