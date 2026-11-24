import type { Editor } from './editor.js'
import type { Block } from './types.js'

export interface TextStyle {
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
}
export const TEXT_BLOCK_TYPES: readonly string[] = Object.freeze([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'number',
  'quote',
  'code',
])
export function parseTextStyle(value: unknown): TextStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected text style object')
  const style: TextStyle = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'fontSize' && typeof item === 'number' && Number.isInteger(item) && item >= 10 && item <= 96)
      style.fontSize = item
    else if ((key === 'bold' || key === 'italic' || key === 'underline') && typeof item === 'boolean')
      style[key] = item
    else if (key === 'align' && (item === 'left' || item === 'center' || item === 'right'))
      style.align = item
    else
      throw new TypeError(`Invalid text style: ${key}`)
  }
  return style
}
export function getTextStyle(block: Block): TextStyle {
  try {
    return parseTextStyle(block.props?.textStyle ?? {})
  }
  catch { return {} }
}
export interface FormatTextPayload { ids: string[], style: TextStyle }
export function parseFormatTextPayload(value: unknown): FormatTextPayload {
  if (!value || typeof value !== 'object')
    throw new TypeError('Expected format payload')
  const { ids, style } = value as FormatTextPayload
  if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === 'string' && id))
    throw new TypeError('Expected nonempty block id array')
  return {
    ids: [
      ...new Set(ids),
    ],
    style: parseTextStyle(style),
  }
}
export function formatText(editor: Editor, value: unknown): void {
  const { ids, style } = parseFormatTextPayload(value)
  const blocks = ids.map(id => editor.getBlock(id))
  if (blocks.some(block => !block || !TEXT_BLOCK_TYPES.includes(block.type)))
    throw new TypeError('Formatting requires text blocks')
  editor.transaction(() => {
    for (const block of blocks as Block[]) {
      editor.update(block.id, {
        props: {
          ...block.props,
          textStyle: {
            ...getTextStyle(block),
            ...style,
          },
        },
      })
    }
  })
}
