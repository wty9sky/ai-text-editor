/** NPM 发布范围：仅文档 / 图片编辑器及其 Vue / React 组件，暂不包含无限画布。 */
export const SDK_PACKAGES = [
  '@sword-editor/runtime',
  '@sword-editor/doc-editor',
  '@sword-editor/image-editor',
]

export const COMPONENT_PACKAGES = [
  '@sword-editor/vue',
  '@sword-editor/react',
]

export const PUBLISH_PACKAGES = [
  ...SDK_PACKAGES,
  ...COMPONENT_PACKAGES,
]

export const PACKAGE_DIRS = Object.fromEntries(
  PUBLISH_PACKAGES.map(name => [name, name.split('/')[1]]),
)
