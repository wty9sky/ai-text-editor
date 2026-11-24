/**
 * SDK dist 混淆配置。
 *
 * 约束：导出名必须保留（renameGlobals: false），.d.ts 不参与混淆，
 * 不使用 eval/selfDefending/debugProtection，确保 NPM 安装后 ESM import 与浏览器 CSP 正常。
 */
export const OBFUSCATION_MARKER = '/* sword-editor:obfuscated */'

export const OBFUSCATION_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  ignoreImports: true,
  log: false,
  renameGlobals: false,
  renameProperties: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: [],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  target: 'browser-no-eval',
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
}
