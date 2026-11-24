import { expect, it } from 'vitest'
import { Editor, syncDocument } from '../src/index.js'

it('preserves JSON extension data and history on controlled echoes', () => {
  const editor = new Editor()
  const document = { format: 'site.block-document' as const, version: 1 as const, id: 'json', metadata: { custom: ['kept'] }, blocks: [{ id: 'unknown', type: 'custom', text: '', props: { nested: { value: 42 } } }] }
  syncDocument(editor, document)
  editor.update('unknown', { text: 'edited' })
  const signal = editor.signal
  expect(syncDocument(editor, JSON.parse(JSON.stringify(editor.toDocument())))).toBe(false)
  expect(editor.canUndo).toBe(true)
  expect(editor.signal).toBe(signal)
  expect(editor.toDocument().metadata).toEqual(document.metadata)
  expect(editor.blocks[0].props).toEqual(document.blocks[0].props)
  expect(() => syncDocument(editor, { ...document, version: 2 })).toThrow()
  expect(editor.blocks[0].text).toBe('edited')
  editor.destroy()
})
