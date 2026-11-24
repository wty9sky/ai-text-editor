/**
 * Markdown ↔ 块 双向转换（框架无关）
 *
 * 转换以「块类型」为驱动，不写死任何块：解析时逐个块类型的 `parse` 尝试匹配，
 * 序列化时调用对应 `serialize`。默认使用内置块类型，也可传入插件聚合后的块类型列表。
 */
import type { Block, BlockTypeDef } from './types.js'

let seq = 0
/** 生成一个块 id（编辑器内稳定、跨实例不冲突） */
export function newBlockId(): string {
  seq += 1
  return `blk-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${seq.toString(36)}`}`
}
/** 便捷创建块 */
export function createBlock<T extends Record<string, any> = Record<string, any>>(type: string, text = '', extra?: Partial<Block<T>>): Block<T> {
  return {
    id: newBlockId(),
    type,
    text,
    ...extra,
  } as Block<T>
}
/** 按类型查定义（在给定类型列表内） */
function findType(blockTypes: readonly BlockTypeDef<any>[], type: string): BlockTypeDef<any> | undefined {
  return blockTypes.find(d => d.type === type)
}
/**
 * Markdown → 块
 *
 * 逐行扫描，按 blockTypes 的注册顺序让每个 `parse` 尝试匹配；命中则消费对应行数生成块，
 * 全部不命中时降级为段落。
 */
export function markdownToBlocks(md: string, blockTypes: readonly BlockTypeDef<any>[] = []): Block[] {
  const defs = blockTypes
  const text = md ?? ''
  if (!text.trim()) {
    return [
      createBlock('paragraph'),
    ]
  }
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    let matched = false
    for (const def of defs) {
      if (!def.parse)
        continue
      const result = def.parse(lines, i)
      if (result) {
        const { consumed, ...rest } = result
        if (!Number.isInteger(consumed) || consumed < 1 || consumed > lines.length - i)
          throw new Error(`Invalid consumed count from block parser: ${def.type}`)
        blocks.push({
          id: newBlockId(),
          type: def.type,
          text: '',
          ...rest,
        } as Block)
        i += Math.max(1, consumed)
        matched = true
        break
      }
    }
    if (!matched) {
      blocks.push(createBlock('paragraph', line.trim()))
      i += 1
    }
  }
  // 空文档也给一个空段落，保证编辑器始终有输入点
  return blocks.length
    ? blocks
    : [
        createBlock('paragraph'),
      ]
}
/**
 * 块 → Markdown
 *
 * 遍历块，调用对应类型 `serialize` 生成 Markdown 行（可多行）。
 * 有序列表的序号由转换器统一维护，遇到非 number 块归零。
 */
export function blocksToMarkdown(blocks: readonly Block[], blockTypes: readonly BlockTypeDef<any>[] = []): string {
  const lines: string[] = []
  let numberIndex = 0
  let prev: Block | null = null
  for (const b of blocks) {
    if (b.type !== 'number')
      numberIndex = 0
    // 相邻块之间用空行分隔（保证段落 / 标题等 Markdown 语义正确）；
    // 相邻的两个列表项之间不加空行，保持列表连续
    if (prev && lines.length) {
      const prevIsList = prev.type === 'bullet' || prev.type === 'number'
      const curIsList = b.type === 'bullet' || b.type === 'number'
      if (!(prevIsList && curIsList))
        lines.push('')
    }
    const def = findType(blockTypes, b.type)
    if (def?.serialize) {
      if (b.type === 'number')
        numberIndex += 1
      lines.push(def.serialize(b, { numberIndex }))
    }
    else {
      // 未注册的类型降级为纯文本，保证输出不丢内容
      lines.push(b.text)
    }
    prev = b
  }
  return lines.join('\n')
}
/** 把一段文本（如 AI 生成结果）解析为块，用于整体插入 */
export function textToBlocks(md: string, blockTypes: readonly BlockTypeDef<any>[] = []): Block[] {
  return markdownToBlocks(md, blockTypes)
}
