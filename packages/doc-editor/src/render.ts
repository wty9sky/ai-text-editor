/**
 * Markdown → HTML 渲染器（纯函数、框架无关）
 *
 * 供 Vue / React 组件的「预览」与 docx / pdf / png 导出复用。
 * 覆盖常见语法：标题、段落、列表、代码块、引用、表格、分隔线；
 * 行内支持粗体 / 斜体 / 行内代码 / 链接。
 */
/* eslint-disable regexp/no-super-linear-backtracking -- 单行 Markdown 语法匹配，`\s+` 后接 `.*` 在单行内线性有界 */
export interface InlineSeg {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: string
}
export type MdBlock = {
  type: 'heading'
  level: 1 | 2 | 3 | 4
  text: string
} | {
  type: 'paragraph'
  text: string
} | {
  type: 'list'
  ordered: boolean
  items: string[]
} | {
  type: 'code'
  code: string
} | {
  type: 'quote'
  text: string
} | {
  type: 'hr'
} | {
  type: 'table'
  header: string[]
  rows: string[][]
}
/** 行内：粗体 **x** / 斜体 *x* / 行内代码 `x` / 链接 [t](u) */
export function parseInline(text: string): InlineSeg[] {
  const segs: InlineSeg[] = []
  const re = /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)/g
  let last = 0
  let m = re.exec(text)
  while (m) {
    if (m.index > last) {
      segs.push({
        text: text.slice(last, m.index),
      })
    }
    const token = m[0]
    if (token.startsWith('**')) {
      segs.push({
        text: token.slice(2, -2),
        bold: true,
      })
    }
    else if (token.startsWith('`')) {
      segs.push({
        text: token.slice(1, -1),
        code: true,
      })
    }
    else if (token.startsWith('[')) {
      const close = token.indexOf('](')
      segs.push({
        text: token.slice(1, close),
        link: token.slice(close + 2, -1),
      })
    }
    else {
      segs.push({
        text: token.slice(1, -1),
        italic: true,
      })
    }
    last = m.index + token.length
    m = re.exec(text)
  }
  if (last < text.length) {
    segs.push({
      text: text.slice(last),
    })
  }
  return segs.filter(s => s.text !== '')
}
/** Markdown 文本 → 块级结构 */
export function parseBlocks(md: string): MdBlock[] {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      const buf: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push({
        type: 'code',
        code: buf.join('\n'),
      })
      continue
    }
    if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }
    if (line.trim().startsWith('|')) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const header = cells(line)
      if (i + 1 < lines.length && /^[\s:|-]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const rows: string[][] = []
        i += 2
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(cells(lines[i]))
          i += 1
        }
        blocks.push({ type: 'table', header, rows })
        continue
      }
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({
        type: 'heading',
        level: h[1].length as 1 | 2 | 3 | 4,
        text: h[2].trim(),
      })
      i += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({
        type: 'quote',
        text: buf.join(' '),
      })
      continue
    }
    const isUL = /^\s*[-*+]\s+/.test(line)
    const isOL = /^\s*\d+[.)]\s+/.test(line)
    if (isUL || isOL) {
      const ordered = isOL
      const items: string[] = []
      while (i < lines.length) {
        const mUL = /^\s*[-*+]\s+(.*)$/.exec(lines[i])
        const mOL = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
        if (ordered && mOL) {
          items.push(mOL[1])
          i += 1
        }
        else if (!ordered && mUL) {
          items.push(mUL[1])
          i += 1
        }
        else {
          break
        }
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const buf: string[] = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,4}\s|```|[-*+]\s|\d+[.)]\s|\s*>\s?|\|)/.test(lines[i])) {
      buf.push(lines[i])
      i += 1
    }
    blocks.push({
      type: 'paragraph',
      text: buf.join(' '),
    })
  }
  return blocks
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function segToHtml(seg: InlineSeg): string {
  let out = esc(seg.text)
  if (seg.code)
    out = `<code>${out}</code>`
  if (seg.bold)
    out = `<strong>${out}</strong>`
  if (seg.italic)
    out = `<em>${out}</em>`
  if (seg.link)
    out = `<a href="${seg.link}">${out}</a>`
  return out
}
function blockToHtml(b: MdBlock): string {
  switch (b.type) {
    case 'heading':
      return `<h${b.level}>${parseInline(b.text).map(segToHtml).join('')}</h${b.level}>`
    case 'paragraph':
      return `<p>${parseInline(b.text).map(segToHtml).join('')}</p>`
    case 'list':
      return b.ordered
        ? `<ol>${b.items.map(it => `<li>${parseInline(it).map(segToHtml).join('')}</li>`).join('')}</ol>`
        : `<ul>${b.items.map(it => `<li>${parseInline(it).map(segToHtml).join('')}</li>`).join('')}</ul>`
    case 'code':
      return `<pre><code>${esc(b.code)}</code></pre>`
    case 'quote':
      return `<blockquote>${parseInline(b.text).map(segToHtml).join('')}</blockquote>`
    case 'hr':
      return '<hr>'
    case 'table': {
      const th = b.header.map(c => `<th>${parseInline(c).map(segToHtml).join('')}</th>`).join('')
      const trs = b.rows.map(r => `<tr>${r.map(c => `<td>${parseInline(c).map(segToHtml).join('')}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
    }
  }
}
export function markdownToHtml(md: string): string {
  return parseBlocks(md).map(blockToHtml).join('\n')
}
