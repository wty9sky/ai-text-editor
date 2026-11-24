import { expect, it } from 'vitest'
import { createBlock, DEFAULT_PLUGINS, Editor, getTextStyle } from '../src/index.js'

it('formats multiple text blocks in one history step and preserves other props', () => {
  const a = createBlock('paragraph', 'one', {
    props: { custom: 'kept' },
  })
  const b = createBlock('h1', 'two')
  const editor = new Editor({ plugins: DEFAULT_PLUGINS })
  editor.setBlocks([a, b])
  editor.execute('core.format', {
    ids: [a.id, b.id],
    style: { fontSize: 24, bold: true, align: 'center' },
  })
  expect(editor.blocks.map(getTextStyle)).toEqual([
    { fontSize: 24, bold: true, align: 'center' },
    { fontSize: 24, bold: true, align: 'center' },
  ])
  expect(editor.blocks[0].props?.custom).toBe('kept')
  expect(editor.toDocument().blocks[0].props?.textStyle.fontSize).toBe(24)
  editor.undo()
  expect(editor.blocks.map(getTextStyle)).toEqual([{}, {}])
  expect(editor.canUndo).toBe(false)
  editor.redo()
  expect(getTextStyle(editor.blocks[1]).fontSize).toBe(24)
  editor.destroy()
})
it('rejects invalid formatting and rolls back policy denial without partial writes', () => {
  const editor = new Editor({ plugins: DEFAULT_PLUGINS })
  const id = editor.blocks[0].id
  for (const style of [
    { fontSize: 9 },
    { fontSize: '24' },
    { align: 'justify' },
    { color: 'red' },
    { bold: 'yes' },
  ]) {
    expect(() => editor.execute('core.format', {
      ids: [id],
      style,
    })).toThrow()
  }
  expect(() => editor.execute('core.format', {
    ids: [id, 'missing'],
    style: { bold: true },
  })).toThrow()
  const stop = editor.hooks.on('transaction:beforeCommit', () => ({ allow: false, code: 'DENIED' }))
  expect(() => editor.execute('core.format', {
    ids: [id],
    style: { fontSize: 24 },
  })).toThrow()
  expect(getTextStyle(editor.blocks[0])).toEqual({})
  expect(editor.canUndo).toBe(false)
  stop()
  editor.destroy()
})
it('carries text style to split blocks and tolerates unknown imported style data', () => {
  const editor = new Editor({ plugins: DEFAULT_PLUGINS })
  const id = editor.blocks[0].id
  editor.update(id, {
    text: 'abcd',
    props: {
      textStyle: { fontSize: 20, italic: true },
    },
  })
  const next = editor.execute('core.split', { id, from: 2 }) as string
  expect(getTextStyle(editor.getBlock(next)!)).toEqual({ fontSize: 20, italic: true })
  expect(getTextStyle({
    id: 'x',
    type: 'paragraph',
    text: '',
    props: {
      textStyle: { fontSize: 'unsafe' },
    },
  })).toEqual({})
  editor.destroy()
})
