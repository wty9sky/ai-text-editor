import { EditorCore, EditorPlugin } from '../EditorCore';
import { SlashCommand } from '../extensions/SlashCommand';
import tippy, { Instance, Props } from 'tippy.js';
import { Editor } from '@tiptap/core';

interface CommandItem {
  title: string;
  description?: string;
  icon?: string;
  command: (props: { editor: Editor; range: any }) => void;
  category: 'basic' | 'common';
}

export class SlashMenuPlugin implements EditorPlugin {
  name = 'SlashMenuPlugin';
  private popup: Instance<Props> | null = null;
  private component: HTMLElement | null = null;
  private items: CommandItem[] = [];
  private selectedIndex = 0;

  apply(editor: EditorCore) {
    editor.hooks.beforeInit.tap('SlashMenuPlugin', (options) => {
      // 注册 SlashCommand 扩展
      options.extensions.push(
        SlashCommand.configure({
          suggestion: {
            items: ({ query }) => {
              return this.getFilteredItems(query);
            },
            render: () => {
              return {
                onStart: (props) => {
                  this.createPopup(props);
                },
                onUpdate: (props) => {
                  this.updatePopup(props);
                },
                onKeyDown: (props) => {
                  return this.handleKeyDown(props);
                },
                onExit: () => {
                  this.destroyPopup();
                },
              };
            },
          },
        })
      );
    });
  }

  private getItems(editor: Editor): CommandItem[] {
    return [
      // 基础
      {
        title: '文本',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setParagraph().run();
        },
      },
      {
        title: '一级标题',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
        },
      },
      {
        title: '二级标题',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
        },
      },
      {
        title: '三级标题',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
        },
      },
      {
        title: '有序列表',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        },
      },
      {
        title: '无序列表',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12H3"/><path d="M21 6H3"/><path d="M21 18H3"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="12" cy="18" r="1"/></svg>', // Placeholder icon, adjusted
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run();
        },
      },
      {
        title: '代码块',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        },
      },
      {
        title: '引用',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        },
      },
      {
        title: '分隔线',
        category: 'basic',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        },
      },
      {
        title: '任务',
        category: 'common',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleTaskList().run();
        },
      },
      {
        title: '图片',
        category: 'common',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
        command: ({ editor, range }) => {
          const url = window.prompt('URL');
          if (url) {
            editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
          }
        },
      },
      {
        title: '表格',
        category: 'common',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>',
        command: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        },
      },
    ];
  }

  private getFilteredItems(query: string): CommandItem[] {
    // 这里的 this.editor 需要在 init 中获取，或者这里直接获取不到
    // 我们可以暂时不依赖 editor 实例来生成静态列表，或者在 render 时获取
    // 由于 getItems 需要 editor 来执行 command，我们可以延后绑定 command
    // 但 getFilteredItems 的调用者通常会传入 editor 上下文
    // 简单起见，我们在 getItems 中暂时不使用 editor 实例，而是返回配置对象
    // 但是 command 需要 editor
    // 实际上 getFilteredItems 被调用时，我们可能无法直接访问 editor，除非我们在 init 时保存了 editor
    // 但是这里我没有在 init 保存 editor 引用到类属性。
    // 我们可以把 getItems 改为不依赖 editor，或者假设 apply 时保存了 editor
    return this.items.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  }

  private createPopup(props: any) {
    this.items = this.getItems(props.editor);
    this.selectedIndex = 0;
    
    // 创建容器
    this.component = document.createElement('div');
    this.component.className = 'slash-menu';
    this.component.style.backgroundColor = 'white';
    this.component.style.borderRadius = '8px';
    this.component.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    this.component.style.width = '240px';
    this.component.style.maxHeight = '320px';
    this.component.style.overflowY = 'auto';
    this.component.style.padding = '8px 0';
    this.component.style.border = '1px solid #eee';

    // 渲染列表
    this.renderItems(props);

    // Tippy 实例
    this.popup = tippy('body', {
      getReferenceClientRect: props.clientRect,
      appendTo: () => document.body,
      content: this.component,
      showOnCreate: true,
      interactive: true,
      trigger: 'manual',
      placement: 'bottom-start',
    })[0];
  }

  private updatePopup(props: any) {
    this.items = this.getItems(props.editor).filter(item => 
        item.title.toLowerCase().includes(props.query.toLowerCase())
    );
    this.selectedIndex = 0;
    this.renderItems(props);

    if (this.popup) {
        this.popup.setProps({
            getReferenceClientRect: props.clientRect,
        });
    }
  }

  private renderItems(props: any) {
    if (!this.component) return;
    this.component.innerHTML = '';

    if (this.items.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = '无结果';
        empty.style.padding = '8px 12px';
        empty.style.color = '#999';
        empty.style.fontSize = '14px';
        this.component.appendChild(empty);
        return;
    }

    const categories = {
        basic: '基础',
        common: '常用'
    };

    let currentCategory = '';

    this.items.forEach((item, index) => {
        if (item.category !== currentCategory) {
            currentCategory = item.category;
            const categoryTitle = document.createElement('div');
            categoryTitle.textContent = categories[item.category as keyof typeof categories];
            categoryTitle.style.padding = '8px 12px 4px';
            categoryTitle.style.fontSize = '12px';
            categoryTitle.style.color = '#999';
            this.component!.appendChild(categoryTitle);
        }

        const itemEl = document.createElement('div');
        itemEl.className = `slash-menu-item ${index === this.selectedIndex ? 'is-selected' : ''}`;
        itemEl.style.padding = '6px 12px';
        itemEl.style.cursor = 'pointer';
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'center';
        itemEl.style.fontSize = '14px';
        itemEl.style.color = '#333';
        if (index === this.selectedIndex) {
            itemEl.style.backgroundColor = '#f5f5f5';
        }

        itemEl.innerHTML = `
            <span style="display: flex; align-items: center; margin-right: 8px; color: #666;">${item.icon || ''}</span>
            <span>${item.title}</span>
        `;

        itemEl.addEventListener('click', () => this.selectItem(index, props));
        itemEl.addEventListener('mouseenter', () => {
            this.selectedIndex = index;
            this.renderItems(props); // 重新渲染以更新选中样式
        });

        this.component!.appendChild(itemEl);
    });
  }

  private selectItem(index: number, props: any) {
    const item = this.items[index];
    if (item) {
      item.command(props);
    }
  }

  private handleKeyDown(props: any) {
    if (props.event.key === 'ArrowUp') {
      this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length;
      this.renderItems(props);
      return true;
    }
    if (props.event.key === 'ArrowDown') {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.renderItems(props);
      return true;
    }
    if (props.event.key === 'Enter') {
      this.selectItem(this.selectedIndex, props);
      return true;
    }
    return false;
  }

  private destroyPopup() {
    if (this.popup) {
      this.popup.destroy();
      this.popup = null;
    }
    if (this.component) {
        this.component.remove();
        this.component = null;
    }
  }
}
