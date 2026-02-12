import EventEmitter from 'eventemitter3';
import { SyncHook, AsyncSeriesHook } from 'tapable';

export interface EditorEvents {
  beforeInit: [];
  afterInit: [];
  destroy: [];
  update: [{ content: string; json: any; transaction: any }];
  change: [string];
  selectionUpdate: [{ transaction: any }];
  transaction: [{ transaction: any }];
  focus: [{ event: FocusEvent }];
  blur: [{ event: FocusEvent }];
  [key: string]: any[];
}

export interface EditorHooks {
  // Lifecycle
  beforeInit: AsyncSeriesHook<[any]>;
  afterInit: SyncHook<[EditorCore]>;
  beforeDestroy: SyncHook<[EditorCore]>;
  afterDestroy: SyncHook<void>;

  // Event Flow
  update: SyncHook<[{ content: string; json: any; transaction: any }]>;
  selectionUpdate: SyncHook<[{ selection: any; transaction: any }]>;
  transaction: SyncHook<[{ transaction: any }]>;
  focus: SyncHook<[{ event: FocusEvent }]>;
  blur: SyncHook<[{ event: FocusEvent }]>;
}

export interface EditorPlugin {
  name: string;
  apply: (editor: EditorCore) => void;
}

/**
 * 编辑器核心抽象类
 * 定义了通用的编辑器接口，使得 UI 层可以与具体的编辑器实现解耦
 * 结合了 EventEmitter3 (用于简单事件监听) 和 Tapable (用于插件钩子系统)
 */
export abstract class EditorCore extends EventEmitter<string | symbol> {
  protected options: any;
  public hooks: EditorHooks;
  protected plugins: EditorPlugin[] = [];

  constructor(options: any = {}) {
    super();
    this.options = options;
    this.hooks = {
      beforeInit: new AsyncSeriesHook(['options']),
      afterInit: new SyncHook(['editor']),
      beforeDestroy: new SyncHook(['editor']),
      afterDestroy: new SyncHook(),
      update: new SyncHook(['data']),
      selectionUpdate: new SyncHook(['data']),
      transaction: new SyncHook(['data']),
      focus: new SyncHook(['data']),
      blur: new SyncHook(['data']),
    };
  }

  /** 注册插件 */
  public use(plugin: EditorPlugin): this {
    this.plugins.push(plugin);
    plugin.apply(this);
    return this;
  }

  /** 初始化编辑器 */
  public abstract init(): Promise<void>;

  /** 销毁编辑器 */
  public abstract destroy(): void;

  // --- 状态查询 ---

  /** 获取 HTML 内容 */
  public abstract getHTML(): string;

  /** 获取 JSON 内容 */
  public abstract getJSON(): any;

  /** 设置内容 */
  public abstract setContent(content: string | object, emitUpdate?: boolean): void;

  /** 清空内容 */
  public abstract clearContent(emitUpdate?: boolean): void;

  /** 编辑器是否可编辑 */
  public abstract isEditable(): boolean;

  /** 设置是否可编辑 */
  public abstract setEditable(editable: boolean): void;

  /** 编辑器是否为空 */
  public abstract isEmpty(): boolean;

  /** 检查当前选区是否包含某种标记或节点 */
  public abstract isActive(name: string, attributes?: Record<string, any>): boolean;

  /** 获取当前选区选中的文本 */
  public abstract getSelectedText(): string;

  // --- 核心操作 ---

  /** 聚焦编辑器 */
  public abstract focus(position?: 'start' | 'end' | 'all' | number | boolean | null): void;

  /** 失焦 */
  public abstract blur(): void;

  // --- 历史记录 ---
  public abstract undo(): void;
  public abstract redo(): void;

  // --- 文本格式化 ---
  public abstract toggleBold(): void;
  public abstract toggleItalic(): void;
  public abstract toggleStrike(): void;
  public abstract toggleCode(): void;
  public abstract toggleUnderline(): void;
  
  public abstract setParagraph(): void;
  public abstract setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void;
  
  public abstract toggleBulletList(): void;
  public abstract toggleOrderedList(): void;
  public abstract toggleTaskList(): void;
  
  public abstract toggleBlockquote(): void;
  public abstract toggleCodeBlock(): void;
  
  public abstract setHorizontalRule(): void;
  public abstract setHardBreak(): void;
  
  public abstract unsetAllMarks(): void;
  public abstract clearNodes(): void;
}
