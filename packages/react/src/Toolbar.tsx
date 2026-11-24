import type { ExportContext, TextStyle } from '@sword-editor/doc-editor'
import { blocksToMarkdown, getTextStyle, TEXT_BLOCK_TYPES } from '@sword-editor/doc-editor'
import { useDocEditor } from './context.js'
import { Dropdown } from './Dropdown.js'
import { resolveIcon } from './icons.js'

export function Toolbar({ title }: { title?: string }) {
  const { editor, insertBlock } = useDocEditor()

  const toolbarItems = editor.plugins.toolbar.filter(item =>
    !item.when || item.when({
      editor,
      selection: [...editor.selection],
      selectedBlocks: editor.selectedBlocks,
    }),
  )
  const insertables = editor.plugins.listInsertableBlocks()
  const exporters = editor.plugins.listExporters()

  const selected = editor.selectedBlocks.filter(block => TEXT_BLOCK_TYPES.includes(block.type))
  const activeStyle = selected[0]
    ? getTextStyle(selected[0])
    : {}
  function format(style: TextStyle) {
    if (!selected.length)
      return
    try {
      editor.execute('core.format', {
        ids: selected.map(block => block.id),
        style,
      })
    }
    catch (error) { editor.reportError(error) }
  }
  function convert(type: string) {
    try {
      editor.transaction(() => {
        for (const block of selected) editor.convert(block.id, type)
      })
    }
    catch (error) { editor.reportError(error) }
  }
  function insertAtEnd(type: string) {
    insertBlock(type, editor.blocks.length - 1, true)
  }

  function onExport(id: string) {
    const exporter = editor.plugins.getExporter(id)
    if (!exporter)
      return
    const ctx: ExportContext = {
      editor,
      blocks: [...editor.blocks],
      markdown: blocksToMarkdown(editor.blocks, editor.plugins.blockTypes),
      title,
    }
    exporter.export(ctx)
  }

  return (
    <div className="sword-toolbar" role="toolbar" aria-label="文档编辑工具栏">
      <span className="sword-toolbar-label">文字</span>
      <select aria-label="块类型" disabled={!selected.length} value={selected[0]?.type || ''} onChange={e => convert(e.target.value)}>
        <option value="" disabled>选择文本块</option>
        {TEXT_BLOCK_TYPES.map(type => <option key={type} value={type}>{editor.plugins.getBlockType(type)?.label || type}</option>)}
      </select>
      <select
        aria-label="文字大小"
        disabled={!selected.length}
        value={activeStyle.fontSize || ''}
        onChange={e => format({
          fontSize: Number(e.target.value),
        })}
      >
        <option value="" disabled>默认字号</option>
        {[
          10,
          12,
          14,
          16,
          18,
          20,
          24,
          28,
          32,
          36,
          48,
          64,
          96,
        ].map(size => (
          <option key={size} value={size}>
            {size}
            {' '}
            px
          </option>
        ))}
      </select>
      <button type="button" className="sword-format-button" aria-label="粗体" aria-pressed={!!activeStyle.bold} disabled={!selected.length} onMouseDown={e => e.preventDefault()} onClick={() => format({ bold: !activeStyle.bold })}><strong>B</strong></button>
      <button type="button" className="sword-format-button" aria-label="斜体" aria-pressed={!!activeStyle.italic} disabled={!selected.length} onMouseDown={e => e.preventDefault()} onClick={() => format({ italic: !activeStyle.italic })}><em>I</em></button>
      <button type="button" className="sword-format-button" aria-label="下划线" aria-pressed={!!activeStyle.underline} disabled={!selected.length} onMouseDown={e => e.preventDefault()} onClick={() => format({ underline: !activeStyle.underline })}><u>U</u></button>
      <select aria-label="文字对齐" disabled={!selected.length} value={activeStyle.align || 'left'} onChange={e => format({ align: e.target.value as TextStyle['align'] })}>
        <option value="left">左对齐</option>
        <option value="center">居中</option>
        <option value="right">右对齐</option>
      </select>
      {toolbarItems.map((item) => {
        const Icon = resolveIcon(item.icon)
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            className="flex size-7 items-center justify-center rounded text-(--ink-3) transition-colors hover:bg-(--panel-2) hover:text-(--ink-1) disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => item.action({
              editor,
              selection: [...editor.selection],
              selectedBlocks: editor.selectedBlocks,
            })}
          >
            {Icon
              ? <Icon className="size-4" />
              : item.label}
          </button>
        )
      })}

      <div className="mx-1 h-4 w-px bg-(--line)" />

      <Dropdown trigger={<button type="button" className="rounded px-2 py-1 text-[12px] text-(--ink-2) transition-colors hover:bg-(--panel-3)">插入</button>}>
        {close => insertables.map(t => (
          <button
            key={t.type}
            type="button"
            className="sword-menu-item"
            onClick={() => {
              insertAtEnd(t.type)
              close()
            }}
          >
            {(() => {
              const Icon = resolveIcon(t.icon)
              return Icon
                ? <Icon className="size-3.5" />
                : null
            })()}
            {t.label}
          </button>
        ))}
      </Dropdown>

      {exporters.length > 0 && (
        <Dropdown trigger={(
          <button type="button" className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-(--ink-2) transition-colors hover:bg-(--panel-3)">
            {(() => {
              const Download = resolveIcon('download')
              return Download
                ? <Download className="size-3.5" />
                : null
            })()}
            导出
          </button>
        )}
        >
          {close => exporters.map(e => (
            <button
              key={e.id}
              type="button"
              className="sword-menu-item"
              onClick={() => {
                onExport(e.id)
                close()
              }}
            >
              {e.label}
            </button>
          ))}
        </Dropdown>
      )}
    </div>
  )
}
