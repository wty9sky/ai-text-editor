import { EditorCore } from './EditorCore';
import { Editor, EditorOptions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import { SlashMenuPlugin } from './plugins/SlashMenuPlugin';

export interface TiptapEditorOptions extends Partial<EditorOptions> {
  container?: HTMLElement | string;
}

/**
 * 基于 Tiptap 2 的富文本编辑器适配层
 * 继承自 EditorCore，实现架构分离
 */
export class TiptapEditor extends EditorCore {
  private editor: Editor | null = null;

  constructor(options: TiptapEditorOptions = {}) {
    super(options);
    // 注册内置插件
    this.use(new SlashMenuPlugin());
  }

  public async init(): Promise<void> {
    const options = this.options as TiptapEditorOptions;
    
    // Lifecycle: beforeInit (Async)
    // 允许插件在初始化前修改配置或执行异步操作
    await this.hooks.beforeInit.promise(options);
    this.emit('beforeInit');

    const element = typeof options.container === 'string' 
      ? document.querySelector(options.container) 
      : options.container;

    // 默认扩展
    const extensions = [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Image,
      Link.configure({
        openOnClick: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: '输入 / 以唤起菜单...',
      }),
      ...(options.extensions || [])
    ];

    this.editor = new Editor({
      element: element as HTMLElement,
      extensions,
      content: options.content || '<p></p>',
      editable: options.editable,
      autofocus: options.autofocus,
      onUpdate: ({ editor, transaction }) => {
        const content = editor.getHTML();
        const json = editor.getJSON();
        const data = { content, json, transaction };
        this.hooks.update.call(data);
        this.emit('update', data);
        this.emit('change', content); // 兼容旧习惯
      },
      onSelectionUpdate: ({ editor, transaction }) => {
        const data = { selection: editor.state.selection, transaction };
        this.hooks.selectionUpdate.call(data);
        this.emit('selectionUpdate', { transaction });
      },
      onTransaction: ({ editor, transaction }) => {
        const data = { transaction };
        this.hooks.transaction.call(data);
        this.emit('transaction', data);
      },
      onFocus: ({ editor, event }) => {
        const data = { event };
        this.hooks.focus.call(data);
        this.emit('focus', data);
      },
      onBlur: ({ editor, event }) => {
        const data = { event };
        this.hooks.blur.call(data);
        this.emit('blur', data);
      },
      onDestroy: () => {
        // Tiptap's onDestroy is called after destroy() usually
        // We handle our own lifecycle mainly in destroy() method below
        this.emit('destroy');
      },
      ...options
    });

    this.hooks.afterInit.call(this);
    this.emit('afterInit', this.editor);
  }

  public override destroy(): void {
    if (this.editor) {
      this.hooks.beforeDestroy.call(this);
      this.editor.destroy();
      this.editor = null;
      this.hooks.afterDestroy.call();
    }
    this.removeAllListeners();
  }

  // --- 状态查询 ---

  public getHTML(): string {
    return this.editor ? this.editor.getHTML() : '';
  }

  public getJSON(): any {
    return this.editor ? this.editor.getJSON() : {};
  }

  public setContent(content: string | object, emitUpdate: boolean = false): void {
    if (this.editor) {
      this.editor.commands.setContent(content, { emitUpdate });
    }
  }

  public clearContent(emitUpdate: boolean = false): void {
    if (this.editor) {
      this.editor.commands.clearContent(emitUpdate);
    }
  }

  public isEditable(): boolean {
    return this.editor ? this.editor.isEditable : false;
  }

  public setEditable(editable: boolean): void {
    if (this.editor) {
      this.editor.setEditable(editable);
    }
  }

  public isEmpty(): boolean {
    return this.editor ? this.editor.isEmpty : true;
  }

  public isActive(name: string, attributes?: Record<string, any>): boolean {
    return this.editor ? this.editor.isActive(name, attributes) : false;
  }

  public getSelectedText(): string {
    if (!this.editor) return '';
    const { from, to } = this.editor.state.selection;
    return this.editor.state.doc.textBetween(from, to, ' ');
  }

  // --- 核心操作 ---

  public focus(position: 'start' | 'end' | 'all' | number | boolean | null = null): void {
    if (this.editor) {
      this.editor.commands.focus(position);
    }
  }

  public blur(): void {
    if (this.editor) {
      this.editor.commands.blur();
    }
  }

  // --- 历史记录 ---

  public undo(): void {
    this.editor?.chain().focus().undo().run();
  }

  public redo(): void {
    this.editor?.chain().focus().redo().run();
  }

  // --- 文本格式化 ---

  public toggleBold(): void {
    this.editor?.chain().focus().toggleBold().run();
  }

  public toggleItalic(): void {
    this.editor?.chain().focus().toggleItalic().run();
  }

  public toggleStrike(): void {
    this.editor?.chain().focus().toggleStrike().run();
  }

  public toggleCode(): void {
    this.editor?.chain().focus().toggleCode().run();
  }

  public toggleUnderline(): void {
    this.editor?.chain().focus().toggleUnderline().run();
  }

  public setParagraph(): void {
    this.editor?.chain().focus().setParagraph().run();
  }

  public setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void {
    this.editor?.chain().focus().toggleHeading({ level }).run();
  }

  public toggleBulletList(): void {
    this.editor?.chain().focus().toggleBulletList().run();
  }

  public toggleOrderedList(): void {
    this.editor?.chain().focus().toggleOrderedList().run();
  }

  public toggleTaskList(): void {
    this.editor?.chain().focus().toggleTaskList().run();
  }

  public toggleBlockquote(): void {
    this.editor?.chain().focus().toggleBlockquote().run();
  }

  public toggleCodeBlock(): void {
    this.editor?.chain().focus().toggleCodeBlock().run();
  }

  public setHorizontalRule(): void {
    this.editor?.chain().focus().setHorizontalRule().run();
  }

  public setHardBreak(): void {
    this.editor?.chain().focus().setHardBreak().run();
  }

  public unsetAllMarks(): void {
    this.editor?.chain().focus().unsetAllMarks().run();
  }

  public clearNodes(): void {
    this.editor?.chain().focus().clearNodes().run();
  }

  /**
   * 获取原生 Tiptap Editor 实例
   */
  public getNativeEditor(): Editor | null {
    return this.editor;
  }
}
