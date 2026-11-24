/* eslint-disable regexp/no-super-linear-backtracking -- 单行 Markdown 语法匹配，`\s+` 后接 `.*` 在单行内线性有界 */
/**
 * 内置块类型 + 内置插件
 *
 * - BUILTIN_BLOCK_TYPES：常见 Markdown 结构（文本 / 标题 / 列表 / 引用 / 代码 /
 *   图片 / 视频 / 附件 / 分割线）；
 * - coreBlocksPlugin：把这些块类型注册进编辑器；
 * - coreOpsPlugin：把撤销 / 重做 / 上移 / 下移 / 复制 / 删除这些基础操作
 *   以「插件」方式挂到工具栏与右键菜单，演示块级操作的扩展方式。
 *
 * 两者都是普通插件，业务方可按需裁剪 / 替换。
 */
import type { EditorActionContext } from './extensions.js'
import type { BlockTypeDef } from './types.js'
import { createBlock } from './markdown.js'
import { definePlugin } from './plugin.js'
import { formatText, getTextStyle, parseFormatTextPayload } from './text-style.js'

export const BUILTIN_BLOCK_TYPES: BlockTypeDef[] = [
  {
    type: 'paragraph',
    label: '文本',
    icon: 'type',
    // 段落是兜底块，不注册 parse（转换器在其它类型都不匹配时落到段落）
    serialize: block => block.text,
  },
  {
    type: 'h1',
    label: '一级标题',
    icon: 'heading-1',
    parse: (lines, index) => {
      const m = /^#\s+(.*)$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `# ${block.text}`,
  },
  {
    type: 'h2',
    label: '二级标题',
    icon: 'heading-2',
    parse: (lines, index) => {
      const m = /^##\s+(.*)$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `## ${block.text}`,
  },
  {
    type: 'h3',
    label: '三级标题',
    icon: 'heading-3',
    parse: (lines, index) => {
      const m = /^###\s+(.*)$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `### ${block.text}`,
  },
  {
    type: 'bullet',
    label: '无序列表',
    icon: 'list',
    parse: (lines, index) => {
      const m = /^\s*[-*+]\s+(.*)$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `- ${block.text}`,
  },
  {
    type: 'number',
    label: '有序列表',
    icon: 'list-ordered',
    parse: (lines, index) => {
      const m = /^\s*\d+[.)]\s+(.*)$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: (block, ctx) => `${ctx.numberIndex}. ${block.text}`,
  },
  {
    type: 'quote',
    label: '引用',
    icon: 'text-quote',
    parse: (lines, index) => {
      const m = /^>\s?(.*)$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `> ${block.text}`,
  },
  {
    type: 'code',
    label: '代码块',
    icon: 'code',
    parse: (lines, index) => {
      const m = /^```(\S*)\s*$/.exec(lines[index])
      if (!m)
        return null
      const lang = m[1] || ''
      const code: string[] = []
      let i = index + 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      if (i < lines.length)
        i += 1 // 收尾 ```
      return {
        text: code.join('\n'),
        lang,
        consumed: i - index,
      }
    },
    serialize: block => `\`\`\`${block.lang || ''}\n${block.text}\n\`\`\``,
  },
  {
    type: 'image',
    label: '图片',
    icon: 'image',
    leaf: true,
    parse: (lines, index) => {
      const m = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(lines[index])
      return m
        ? {
            text: m[2].trim(),
            alt: m[1] || '',
            consumed: 1,
          }
        : null
    },
    serialize: block => `![${block.alt || ''}](${block.text})`,
  },
  {
    type: 'video',
    label: '视频',
    icon: 'video',
    leaf: true,
    parse: (lines, index) => {
      const m = /^@\[video\]\(([^)]+)\)\s*$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `@[video](${block.text})`,
  },
  {
    type: 'attachment',
    label: '附件',
    icon: 'paperclip',
    leaf: true,
    parse: (lines, index) => {
      const m = /^@\[file\]\(([^)]+)\)\s*$/.exec(lines[index])
      return m
        ? {
            text: m[1].trim(),
            consumed: 1,
          }
        : null
    },
    serialize: block => `@[file](${block.text})`,
  },
  {
    type: 'divider',
    label: '分割线',
    icon: 'minus',
    leaf: true,
    parse: (lines, index) => {
      if (!/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index]))
        return null
      return { consumed: 1 }
    },
    serialize: () => '---',
  },
]
/** 内置块类型插件 */
export const coreBlocksPlugin = definePlugin({
  name: 'core.blocks',
  install(ctx) {
    for (const def of BUILTIN_BLOCK_TYPES)
      ctx.registerBlockType(def)
  },
})
/** 多选感知：命中块在选中集里时操作整个选中集，否则只操作该块 */
function targetIds(ctx: EditorActionContext): string[] {
  return ctx.selection.includes(ctx.block.id)
    ? [...ctx.selection]
    : [ctx.block.id]
}
/** 内置基础操作插件（工具栏撤销/重做 + 右键块级操作） */
export const coreOpsPlugin = definePlugin({
  name: 'core.ops',
  install(ctx) {
    ctx.registerCommand({
      id: 'core.undo',
      execute: editor => editor.undo(),
    })
    ctx.registerCommand({
      id: 'core.redo',
      execute: editor => editor.redo(),
    })
    ctx.registerCommand({
      id: 'core.delete',
      execute: (editor, payload) => editor.remove(ids(payload)),
    })
    ctx.registerCommand({
      id: 'core.duplicate',
      execute: (editor, payload) => editor.duplicate(ids(payload)),
    })
    ctx.registerCommand({
      id: 'core.move-up',
      execute: (editor, payload) => editor.move(ids(payload), -1),
    })
    ctx.registerCommand({
      id: 'core.move-down',
      execute: (editor, payload) => editor.move(ids(payload), 1),
    })
    ctx.registerToolbar({
      id: 'core.undo',
      label: '撤销',
      icon: 'undo-2',
      when: ({ editor }) => editor.canUndo,
      action: ({ editor }) => {
        editor.execute('core.undo')
      },
    })
    ctx.registerToolbar({
      id: 'core.redo',
      label: '重做',
      icon: 'redo-2',
      when: ({ editor }) => editor.canRedo,
      action: ({ editor }) => {
        editor.execute('core.redo')
      },
    })
    ctx.registerContextMenu({
      id: 'core.move-up',
      label: '上移',
      icon: 'arrow-up',
      group: 'operation',
      when: c => c.index > 0,
      action: (c) => {
        c.editor.execute('core.move-up', targetIds(c))
      },
    })
    ctx.registerContextMenu({
      id: 'core.move-down',
      label: '下移',
      icon: 'arrow-down',
      group: 'operation',
      when: c => c.index < c.editor.blocks.length - 1,
      action: (c) => {
        c.editor.execute('core.move-down', targetIds(c))
      },
    })
    ctx.registerContextMenu({
      id: 'core.duplicate',
      label: '复制',
      icon: 'copy',
      group: 'operation',
      action: (c) => {
        c.editor.execute('core.duplicate', targetIds(c))
      },
    })
    ctx.registerContextMenu({
      id: 'core.delete',
      label: '删除',
      icon: 'trash-2',
      group: 'operation',
      danger: true,
      action: (c) => {
        c.editor.execute('core.delete', targetIds(c))
      },
    })
  },
})
/** 默认插件集（块类型 + 基础操作），DocEditor 无插件注入时用它兜底 */
function ids(input: unknown): string[] {
  if (!Array.isArray(input) || !input.every(id => typeof id === 'string'))
    throw new Error('Expected block id array')
  return input
}
/** Text editing policy is replaceable independently of history and the document model. */
export const coreTextPlugin = definePlugin({
  name: 'core.text',
  install(ctx) {
    ctx.registerCommand({
      id: 'core.format',
      validate: (payload) => { parseFormatTextPayload(payload) },
      execute: (editor, payload) => formatText(editor, payload),
    })
    ctx.registerCommand({
      id: 'core.split',
      execute(editor, payload) {
        const p = payload as {
          id: string
          from: number
          to?: number
        }
        const block = editor.getBlock(p.id)
        if (!block)
          throw new Error('Unknown text block')
        const to = p.to ?? p.from
        if (!Number.isInteger(p.from) || !Number.isInteger(to) || p.from < 0 || to < p.from || to > block.text.length)
          throw new Error('Invalid text selection')
        const next = createBlock(block.type === 'bullet' || block.type === 'number'
          ? block.type
          : 'paragraph', block.text.slice(to))
        if (block.props?.textStyle) {
          next.props = {
            ...next.props,
            textStyle: getTextStyle(block),
          }
        }
        editor.transaction(() => {
          editor.update(block.id, {
            text: block.text.slice(0, p.from),
          })
          editor.insert(editor.indexOf(block.id) + 1, next)
        })
        return next.id
      },
    })
  },
})
export const DEFAULT_PLUGINS = [coreBlocksPlugin, coreOpsPlugin, coreTextPlugin]
