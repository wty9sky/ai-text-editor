import type { Block } from './types.js'
import { immutableJson } from '@sword-editor/runtime'

export interface EditorDocument {
  format: 'site.block-document'
  version: 1
  id: string
  blocks: Block[]
  metadata?: Record<string, unknown>
}
export function validateBlocks(input: unknown): Block[] {
  if (!Array.isArray(input))
    throw new TypeError('Document blocks must be an array')
  const ids = new Set<string>()
  for (const block of input) {
    if (!block || typeof block.id !== 'string' || !block.id || typeof block.type !== 'string' || !block.type || typeof block.text !== 'string')
      throw new Error('Invalid block: expected nonempty id/type and string text')
    if (ids.has(block.id))
      throw new Error(`Duplicate block id: ${block.id}`)
    ids.add(block.id)
    if (block.props !== undefined && (!block.props || Array.isArray(block.props) || typeof block.props !== 'object'))
      throw new Error('Block props must be an object')
    for (const field of ['lang', 'alt']) {
      if (block[field] !== undefined && typeof block[field] !== 'string')
        throw new Error(`Invalid block ${field}`)
    }
  }
  return immutableJson(input) as Block[]
}
export function parseDocument(input: unknown): EditorDocument {
  const value = typeof input === 'string'
    ? JSON.parse(input)
    : input
  if (!value || value.format !== 'site.block-document' || value.version !== 1)
    throw new Error('Unsupported block document format/version')
  if (typeof value.id !== 'string' || !value.id)
    throw new Error('Document id is required')
  if (value.metadata !== undefined && (!value.metadata || Array.isArray(value.metadata) || typeof value.metadata !== 'object'))
    throw new Error('Document metadata must be an object')
  return immutableJson({
    ...value,
    blocks: validateBlocks(value.blocks),
  })
}

/** Apply external JSON only when content differs, preserving history on controlled echoes. */
export function syncDocument(editor: { toDocument: () => EditorDocument, loadDocument: (input: unknown) => void }, input: unknown): boolean {
  const document = parseDocument(input)
  if (JSON.stringify(document) === JSON.stringify(editor.toDocument()))
    return false
  editor.loadDocument(document)
  return true
}
