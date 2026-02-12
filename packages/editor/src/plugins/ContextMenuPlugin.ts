import { EditorCore, EditorPlugin } from '../EditorCore';

export interface ContextMenuItem {
  label: string;
  action: (editor: EditorCore) => void;
  icon?: string;
}

export class ContextMenuPlugin implements EditorPlugin {
  name = 'ContextMenuPlugin';
  private items: ContextMenuItem[] = [];
  private menuElement: HTMLElement | null = null;

  constructor(items: ContextMenuItem[] = []) {
    this.items = items;
  }

  apply(editor: EditorCore) {
    editor.hooks.afterInit.tap('ContextMenuPlugin', () => {
      this.initMenu(editor);
    });

    editor.hooks.beforeDestroy.tap('ContextMenuPlugin', () => {
      this.destroyMenu();
    });
  }

  private initMenu(editor: EditorCore) {
    const editorElement = (editor as any).editor?.view?.dom; // Tiptap specific
    if (!editorElement) return;

    // Create menu DOM
    this.menuElement = document.createElement('div');
    this.menuElement.style.position = 'absolute';
    this.menuElement.style.zIndex = '9999';
    this.menuElement.style.backgroundColor = 'white';
    this.menuElement.style.border = '1px solid #ccc';
    this.menuElement.style.borderRadius = '4px';
    this.menuElement.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    this.menuElement.style.display = 'none';
    this.menuElement.style.padding = '4px 0';
    this.menuElement.style.minWidth = '120px';
    
    // Add items
    this.renderItems(editor);

    document.body.appendChild(this.menuElement);

    // Event listeners
    editorElement.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      this.showMenu(e.pageX, e.pageY);
    });

    document.addEventListener('click', () => {
      this.hideMenu();
    });
  }

  private renderItems(editor: EditorCore) {
    if (!this.menuElement) return;
    this.menuElement.innerHTML = '';
    
    this.items.forEach(item => {
      const el = document.createElement('div');
      el.textContent = item.label;
      el.style.padding = '8px 16px';
      el.style.cursor = 'pointer';
      el.style.fontSize = '14px';
      el.style.color = '#333';
      
      el.addEventListener('mouseenter', () => {
        el.style.backgroundColor = '#f0f0f0';
      });
      el.addEventListener('mouseleave', () => {
        el.style.backgroundColor = 'transparent';
      });

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action(editor);
        this.hideMenu();
      });

      this.menuElement!.appendChild(el);
    });
  }

  private showMenu(x: number, y: number) {
    if (!this.menuElement) return;
    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;
    this.menuElement.style.display = 'block';
  }

  private hideMenu() {
    if (this.menuElement) {
      this.menuElement.style.display = 'none';
    }
  }

  private destroyMenu() {
    if (this.menuElement && this.menuElement.parentNode) {
      this.menuElement.parentNode.removeChild(this.menuElement);
    }
    this.menuElement = null;
  }
}
