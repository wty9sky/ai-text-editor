/**
 * 块编辑器核心数据模型
 *
 * 块（Block）是编辑器的唯一操作单位，所有功能（块类型、工具栏、右键、
 * 导出、上传）都围绕「块」展开。本模块框架无关，不依赖 Vue / React / DOM。
 */
/** 一个块（编辑器的基本单位） */
export interface Block<T extends Record<string, any> = Record<string, any>> {
  /** 块唯一标识（编辑器实例内稳定） */
  id: string
  /** 块类型（内置的 paragraph/h1/image… 或插件注册的 video/attachment…） */
  type: string
  /** 文本内容；code 为多行代码，image/video/attachment 为地址，叶子块可留空 */
  text: string
  /** 代码块语言 */
  lang?: string
  /** 图片 / 视频替代文本 */
  alt?: string
  /** 自定义块的扩展属性（视频封面、附件名称 / 大小等） */
  props?: T
}
/** 解析一行（或多行）Markdown 后的结果 */
export interface BlockParseResult<T extends Record<string, any> = Record<string, any>> {
  text?: string
  lang?: string
  alt?: string
  props?: T
  /** 消费的行数（含当前行），多行块（如代码块 / 自定义围栏）返回 > 1 */
  consumed: number
}
/** 序列化上下文：转换器维护的公共状态 */
export interface SerializeContext {
  /** 当前有序列表的序号（连续 number 块从 1 递增，遇到非 number 块归零） */
  numberIndex: number
}
/**
 * 块类型定义（插件体系中的「块类型」扩展点）
 *
 * 内置块与插件扩展块共用这一套协议：
 * - `parse` 负责「Markdown 行 → 块」；不匹配返回 null，匹配返回块字段 + 消费行数；
 * - `serialize` 负责「块 → Markdown 行（可多行）」；
 * - `leaf` 块没有可编辑文本框（图片 / 分割线 / 视频 / 附件等），由 UI 层用组件渲染。
 */
export interface BlockTypeDef<T extends Record<string, any> = Record<string, any>> {
  /** 块类型标识，全局唯一 */
  type: string
  /** 菜单里的显示名 */
  label: string
  /** 叶子块：不可编辑文本，由 UI 层自定义渲染器绘制 */
  leaf?: boolean
  /** 是否出现在插入菜单（默认 true） */
  insertable?: boolean
  /** 图标名（lucide 图标 key，UI 层据此渲染） */
  icon?: string
  /** 新建块时的默认文本 */
  defaultText?: string
  /** 解析：从 lines[index] 开始尝试匹配，返回块字段 + 消费行数；不匹配返回 null */
  parse?: (lines: string[], index: number) => BlockParseResult<T> | null
  /** 序列化：块 → Markdown 字符串（可多行） */
  serialize?: (block: Block<T>, ctx: SerializeContext) => string
}
