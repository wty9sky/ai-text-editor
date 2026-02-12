import { EditorCore, EditorPlugin } from '../EditorCore';
import { NodeSelection } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { Node } from '@tiptap/pm/model';

export class BlockMenuPlugin implements EditorPlugin {
  name = 'BlockMenuPlugin';
  private menuElement: HTMLElement | null = null;
  private currentBlockPos: number | null = null;
  private editorView: EditorView | null = null;

  apply(editor: EditorCore) {
    editor.hooks.afterInit.tap('BlockMenuPlugin', () => {
      this.initMenu(editor);
      this.initEvents(editor);
    });

    editor.hooks.beforeDestroy.tap('BlockMenuPlugin', () => {
      this.destroyMenu();
    });
  }

  private initMenu(editor: EditorCore) {
    this.menuElement = document.createElement('div');
    // 使用 SVG 图标代替简单的文本，提升视觉效果
    this.menuElement.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="css-i6dzq1"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>';
    this.menuElement.style.position = 'absolute';
    this.menuElement.style.cursor = 'grab';
    this.menuElement.style.color = '#999';
    this.menuElement.style.display = 'none';
    this.menuElement.style.zIndex = '50';
    this.menuElement.style.padding = '4px';
    this.menuElement.style.borderRadius = '4px';
    this.menuElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    this.menuElement.style.transition = 'opacity 0.2s';
    
    // 鼠标悬停样式
    this.menuElement.addEventListener('mouseenter', () => {
        this.menuElement!.style.backgroundColor = '#eee';
        this.menuElement!.style.color = '#333';
    });
    this.menuElement.addEventListener('mouseleave', () => {
        this.menuElement!.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        this.menuElement!.style.color = '#999';
    });

    this.menuElement.draggable = true;
    
    // Click to select block
    this.menuElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectCurrentBlock(editor);
    });

    // Drag support
    this.menuElement.addEventListener('dragstart', (e) => {
      this.handleDragStart(e, editor);
    });

    document.body.appendChild(this.menuElement);
  }

  private initEvents(editor: EditorCore) {
      const view = (editor as any).editor?.view as EditorView;
      if (!view) return;
      this.editorView = view;

      // 使用 mousemove 来检测当前鼠标所在的块
      view.dom.addEventListener('mousemove', (e) => {
          this.handleMouseMove(e, view);
      });

      // 鼠标离开编辑器区域时隐藏
      view.dom.addEventListener('mouseleave', () => {
          // 稍微延迟隐藏，以便鼠标能移动到 handle 上
          // 但因为 handle 在 body 上，且通常紧贴 editor，这里需要小心
          // 如果鼠标移动到了 handle 上，handle 不应该消失
          setTimeout(() => {
              if (this.menuElement && !this.menuElement.matches(':hover')) {
                  this.hideMenu();
              }
          }, 200);
      });
  }

  private handleMouseMove(e: MouseEvent, view: EditorView) {
      if (!this.menuElement) return;

      // 1. 获取鼠标位置对应的 pos
      const coords = { left: e.clientX, top: e.clientY };
      const posResult = view.posAtCoords(coords);
      
      if (!posResult) return;

      // 2. 向上查找块级节点
      // 我们通常想要最外层的块（深度为 1），或者列表项
      const $pos = view.state.doc.resolve(posResult.pos);
      
      let targetDepth = 1;
      // 如果在列表里，可能想要选中列表项而不是列表容器
      // 简单起见，我们查找最近的 block 节点
      // 或者：始终定位到 depth 1 的节点
      
      // 优化：从当前深度向上找，找到第一个 block 节点
      // 但对于 Tiptap，通常 content 是 depth 0 (doc)，paragraph 是 depth 1
      // 所以 depth 1 通常是我们想要的 "Block"
      
      // 处理嵌套情况：比如 blockquote -> paragraph
      // 我们可能想选中 paragraph
      
      // 策略：使用 $pos.depth 作为起点，向上找，直到找到一个 block
      // 实际上，我们希望把 handle 放在鼠标所在的那个视觉块旁边
      
      let foundPos = -1;
      
      for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d);
          if (node.isBlock) {
              // 这里可以加一些过滤，比如排除 doc
              if (d === 0) continue; 
              
              // 暂时锁定 depth 1，因为它是最顶层的块，操作最符合直觉（移动整段）
              // 如果用户需要移动列表项，可能需要更复杂的逻辑
              if (d === 1) {
                  foundPos = $pos.before(d);
                  break;
              }
          }
      }

      if (foundPos !== -1) {
          if (this.currentBlockPos !== foundPos) {
              this.currentBlockPos = foundPos;
              this.updateMenuPosition(view);
          } else {
             // 如果是同一个块，也要确保位置更新（防止布局变化）
             // 优化：可以不每次都更新，但 updateMenuPosition 计算开销不大
             this.updateMenuPosition(view);
          }
      }
  }

  private updateMenuPosition(view: EditorView) {
    if (!this.menuElement || this.currentBlockPos === null) return;

    // 获取 DOM 节点
    // view.nodeDOM(pos) 返回该节点对应的 DOM
    const node = view.nodeDOM(this.currentBlockPos);
    
    if (!node || !(node instanceof HTMLElement)) {
        return;
    }

    // 1. 获取块的边界，用于水平定位
    const rect = node.getBoundingClientRect();
    
    // 2. 获取第一行文本的位置，用于垂直定位
    // 使用 coordsAtPos 获取内容开始位置的坐标，这样能更好地对齐首行文本
    // pos + 1 通常是内容的开始
    let top = rect.top;
    try {
        const coords = view.coordsAtPos(this.currentBlockPos + 1);
        top = coords.top;
    } catch (e) {
        // Fallback to rect.top if coordsAtPos fails
        console.warn('Failed to get coords at pos', e);
    }

    // 计算最终位置
    // 加上 window scroll
    const finalTop = top + window.scrollY;
    // 偏移量：比如左侧 28px
    const left = rect.left + window.scrollX - 28; 

    // 微调：使图标中心对齐文本中心
    // 假设字体大小约 24px (行高)，图标 24px (包含 padding)
    // 如果 top 是字符顶部，可能需要下移一点
    // 通常 coords.top 是字符框的顶部
    
    this.menuElement.style.top = `${finalTop - 2}px`; // 微调 -2px 以视觉居中
    this.menuElement.style.left = `${left}px`;
    this.menuElement.style.display = 'flex'; // flex 居中 icon
    this.menuElement.style.alignItems = 'center';
    this.menuElement.style.justifyContent = 'center';
  }

  private handleDragStart(e: DragEvent, editor: EditorCore) {
    if (this.currentBlockPos === null) return;
    
    const view = (editor as any).editor?.view as EditorView;
    if (!view) return;

    // 1. Select the node
    const tr = view.state.tr;
    tr.setSelection(NodeSelection.create(view.state.doc, this.currentBlockPos));
    view.dispatch(tr);

    // 2. Prepare data for drag
    const slice = view.state.selection.content();
    const node = view.state.doc.nodeAt(this.currentBlockPos);
    
    if (node && e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      
      // Create drag image
      const dragImage = document.createElement('div');
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-10000px';
      dragImage.style.backgroundColor = 'white';
      dragImage.style.padding = '10px';
      dragImage.style.border = '1px solid #ccc';
      dragImage.style.borderRadius = '4px';
      dragImage.style.maxWidth = '300px';
      dragImage.style.overflow = 'hidden';
      dragImage.style.textOverflow = 'ellipsis';
      dragImage.style.whiteSpace = 'nowrap';
      dragImage.textContent = node.textContent.slice(0, 50) || 'Block';
      
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 10, 10);
      setTimeout(() => document.body.removeChild(dragImage), 0);
      
      (view as any).dragging = { slice, move: true };
    }
  }

  private selectCurrentBlock(editor: EditorCore) {
     if (this.currentBlockPos === null) return;
     
     const view = (editor as any).editor?.view;
     if (!view) return;

     const tr = view.state.tr;
     try {
       const selection = NodeSelection.create(view.state.doc, this.currentBlockPos);
       tr.setSelection(selection);
       view.dispatch(tr);
       view.focus();
     } catch (e) {
       console.error('Failed to select block', e);
     }
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
    // Listeners on view.dom are automatically removed when view is destroyed usually,
    // but explicit removal is better if we attached them manually. 
    // However, view.dom might be gone.
  }
}
