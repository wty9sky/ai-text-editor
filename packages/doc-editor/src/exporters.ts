import type { Exporter } from './extensions.js'
import type { MdBlock } from './render.js'
/**
 * 内置导出器（插件体系中的「导出」扩展点）
 *
 * - markdown：导出 .md 源文件；
 * - docx：用 docx 库生成真正的 Word 文档；
 * - pdf：渲染成带打印样式的 HTML，走浏览器「另存为 PDF」；
 * - png：渲染成带样式的 HTML，用 html2canvas 截成图片。
 *
 * Markdown → HTML 解析器复用 SDK（@sword-editor/doc-editor 的 render 模块）。
 */
import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import html2canvas from 'html2canvas'
import { markdownToHtml, parseBlocks, parseInline } from './render.js'

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name || 'download'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function inlineRuns(text: string): TextRun[] {
  return parseInline(text).map((seg) => {
    if (seg.link) {
      return new TextRun({
        text: seg.text,
        bold: seg.bold,
        italics: seg.italic,
        color: '1155CC',
        underline: {},
      })
    }
    return new TextRun({
      text: seg.text,
      bold: seg.bold,
      italics: seg.italic,
      font: seg.code ? 'Consolas' : undefined,
      shading: seg.code
        ? { fill: 'F2F2F2' }
        : undefined,
    })
  })
}
function blockToDocx(b: MdBlock): (Paragraph | Table)[] {
  switch (b.type) {
    case 'heading': {
      const level = ([
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
      ] as const)[b.level - 1] ?? HeadingLevel.HEADING_3
      return [
        new Paragraph({
          heading: level,
          children: inlineRuns(b.text),
        }),
      ]
    }
    case 'paragraph':
      return [
        new Paragraph({
          children: inlineRuns(b.text),
        }),
      ]
    case 'list':
      return b.items.map((it, idx) => new Paragraph({
        children: [
          ...(b.ordered
            ? [
                new TextRun({ text: `${idx + 1}. `, bold: true }),
              ]
            : [
                new TextRun({ text: '• ' }),
              ]),
          ...inlineRuns(it),
        ],
      }))
    case 'code': {
      const lines = b.code.split('\n')
      return [
        new Paragraph({
          children: lines.flatMap((ln, idx) => [
            ...(idx
              ? [
                  new TextRun({ break: 1 }),
                ]
              : []),
            new TextRun({
              text: ln || ' ',
              font: 'Consolas',
              size: 18,
              shading: { fill: 'F2F2F2' },
            }),
          ]),
        }),
      ]
    }
    case 'quote':
      return [
        new Paragraph({
          children: [
            new TextRun({ text: '“', bold: true, color: '888888' }),
            ...inlineRuns(b.text),
          ],
          indent: { left: 360 },
        }),
      ]
    case 'hr':
      return [
        new Paragraph({
          children: [],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' },
          },
        }),
      ]
    case 'table': {
      const cols = b.header.length || 1
      const width = Math.floor(100 / cols)
      const cell = (text: string, head = false) => new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text, bold: head }),
            ],
          }),
        ],
        shading: head
          ? { fill: 'EEEEEE' }
          : undefined,
      })
      const headerRow = new TableRow({
        children: b.header.map(c => cell(c, true)),
        tableHeader: true,
      })
      const bodyRows = b.rows.map(r => new TableRow({
        children: r.map(c => cell(c)),
      }))
      return [
        new Table({
          rows: [headerRow, ...bodyRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ]
    }
  }
}
const PRINT_STYLE = `
body{max-width:760px;margin:0 auto;padding:40px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.75;color:#222;background:#fff}
h1{font-size:24px;border-bottom:1px solid #eee;padding-bottom:8px}
h2{font-size:20px}h3{font-size:17px}h4{font-size:15px}
code{background:#f5f5f5;padding:2px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:13px}
pre{background:#f5f5f5;padding:12px 14px;border-radius:8px;overflow:auto}
pre code{background:none;padding:0}
blockquote{border-left:3px solid #ddd;margin:0;padding:2px 14px;color:#666}
table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
th{background:#f5f5f5}
a{color:#1155cc}
img{max-width:100%}
`.trim()
function renderExportHtml(md: string, title: string): string {
  return `<div style="${PRINT_STYLE}"><h1>${esc(title || '')}</h1>${markdownToHtml(md)}</div>`
}
/** 导出 Markdown 源文件 */
export const markdownExporter: Exporter = {
  id: 'markdown',
  label: 'Markdown',
  extension: 'md',
  mime: 'text/markdown',
  export: ({ markdown, title }) => saveBlob(new Blob([markdown || ''], { type: 'text/markdown;charset=utf-8' }), `${title || '文档'}.md`),
}
/** 导出 Word（.docx） */
export const docxExporter: Exporter = {
  id: 'docx',
  label: 'Word',
  extension: 'docx',
  export: async ({ markdown, title }) => {
    const children = parseBlocks(markdown).flatMap(blockToDocx)
    const doc = new Document({
      creator: 'Personal Suite',
      title,
      sections: [
        { children },
      ],
    })
    const blob = await Packer.toBlob(doc)
    saveBlob(blob, `${title || '文档'}.docx`)
  },
}
/** 导出 PDF（打开打印视图，浏览器「另存为 PDF」） */
export const pdfExporter: Exporter = {
  id: 'pdf',
  label: 'PDF',
  extension: 'pdf',
  export: ({ markdown, title }) => {
    const win = window.open('', '_blank')
    if (!win)
      return
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || '文档')}</title>
<style>${PRINT_STYLE}</style></head><body>${renderExportHtml(markdown, title || '')}</body></html>`)
    win.document.close()
    setTimeout(() => {
      win.focus()
      win.print()
    }, 300)
  },
}
/** 导出 PNG（渲染成带样式 HTML 后截图） */
export const pngExporter: Exporter = {
  id: 'png',
  label: 'PNG 图片',
  extension: 'png',
  export: async ({ markdown, title }) => {
    const host = document.createElement('div')
    host.style.position = 'absolute'
    host.style.left = '-9999px'
    host.style.top = '0'
    host.style.width = '760px'
    host.style.background = '#fff'
    host.innerHTML = renderExportHtml(markdown, title || '')
    document.body.appendChild(host)
    try {
      const canvas = await html2canvas(host, { backgroundColor: '#ffffff', scale: 2 })
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${title || '文档'}.png`
      link.click()
    }
    finally {
      host.remove()
    }
  },
}
/** 默认导出器集（按顺序出现在导出菜单） */
export function createDefaultExporters(): Exporter[] {
  return [
    markdownExporter,
    docxExporter,
    pdfExporter,
    pngExporter,
  ]
}
