/**
 * 图标映射：块类型 / 菜单项里的 icon 字符串 → lucide 组件
 */
import type { Component } from 'vue'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PlusIcon,
  Redo2Icon,
  SparklesIcon,
  TextQuoteIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  VideoIcon,
} from '@lucide/vue'

export const ICONS: Record<string, Component> = {
  'type': TypeIcon,
  'heading-1': Heading1Icon,
  'heading-2': Heading2Icon,
  'heading-3': Heading3Icon,
  'list': ListIcon,
  'list-ordered': ListOrderedIcon,
  'text-quote': TextQuoteIcon,
  'code': CodeIcon,
  'image': ImageIcon,
  'video': VideoIcon,
  'attachment': PaperclipIcon,
  'paperclip': PaperclipIcon,
  'minus': MinusIcon,
  'divider': MinusIcon,
  'undo-2': Undo2Icon,
  'redo-2': Redo2Icon,
  'arrow-up': ArrowUpIcon,
  'arrow-down': ArrowDownIcon,
  'copy': CopyIcon,
  'trash-2': Trash2Icon,
  'plus': PlusIcon,
  'more-horizontal': MoreHorizontalIcon,
  'sparkles': SparklesIcon,
  'download': DownloadIcon,
  'file': FileIcon,
  'file-text': FileTextIcon,
}

export function resolveIcon(name?: string): Component | undefined {
  return name ? ICONS[name] : undefined
}
