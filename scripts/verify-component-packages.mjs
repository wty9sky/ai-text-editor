/** Install only a framework component tarball into each isolated consumer. Run after pnpm build. */
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const output = await mkdtemp(join(tmpdir(), 'editor-consumers-'))
const docsRequire = createRequire(join(root, 'apps/docs/package.json'))
const rootRequire = createRequire(join(root, 'package.json'))
async function packageVersion(name) {
  const require = name === 'typescript' ? rootRequire : docsRequire
  return JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8')).version
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}
for (const framework of ['vue', 'react']) {
  const consumer = join(output, framework)
  const { mkdir } = await import('node:fs/promises')
  await mkdir(consumer)
  run('pnpm', ['pack', '--pack-destination', consumer], join(root, 'packages', framework))
  const tarball = (await readdir(consumer)).find(name => name.endsWith('.tgz'))
  const dependencies = { [`@sword-editor/${framework}`]: `file:./${tarball}` }
  for (const name of framework === 'vue' ? ['vue'] : ['react', 'react-dom']) dependencies[name] = await packageVersion(name)
  const devDependencies = {}
  for (const name of ['vite', 'typescript', ...(framework === 'react' ? ['@types/react', '@types/react-dom'] : [])]) devDependencies[name] = await packageVersion(name)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: `editor-${framework}-consumer`, private: true, type: 'module', dependencies, devDependencies }))
  await writeFile(join(consumer, 'index.html'), '<div id="app"></div><script type="module" src="/main.ts"></script>')
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: false, noEmit: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['main.ts'] }))
  await writeFile(join(consumer, 'main.ts'), `
import { DocEditor, DocEditorContent, ToolBar, createDocEditorSession, Editor, DEFAULT_PLUGINS, definePlugin, defineExtension, defineTopic, createFunctionUploader } from '@sword-editor/${framework}'
import type { EditorDocument, DocumentEditorPlugin } from '@sword-editor/${framework}'
import '@sword-editor/${framework}/style.css'
const plugin: DocumentEditorPlugin = definePlugin({ name: 'consumer.lifecycle', install(ctx) {
  ctx.onDispose(ctx.editor.on(() => {}))
  ctx.hooks.on('transaction:beforeCommit', ({ after }) => after.blocks.length < 1000 ? { allow: true } : { allow: false, code: 'LIMIT' })
  ctx.events.subscribe('transaction:committed', ({ meta }) => { void meta.operationId })
} })
const topic = defineTopic<{ count: number }>('consumer.extension:count')
const extension = defineExtension({ name: 'consumer.extension', version: '1.0.0', apply(sdk) {
  sdk.messages.subscribe(topic, message => { const count: number = message.data.count; void count })
  sdk.messages.publish(topic, { count: 1 })
  sdk.resources.timeout(() => {}, 1)
} })
const editor = new Editor({ plugins: [...DEFAULT_PLUGINS, plugin, extension] })
const document: EditorDocument = editor.toDocument()
const session = createDocEditorSession()
const uploaders = [createFunctionUploader({ kind: 'image', upload: async file => ({ url: URL.createObjectURL(file) }) })]
${framework === 'vue' ? "import { createApp, h } from 'vue'\ncreateApp({ render: () => h('div', [h(ToolBar, { session }), h(DocEditorContent, { session, document, plugins: [plugin], uploaders })]) }).mount('#app')" : "import { createElement } from 'react'\nimport { createRoot } from 'react-dom/client'\ncreateRoot(globalThis.document.getElementById('app')!).render(createElement('div', null, createElement(ToolBar, { session }), createElement(DocEditorContent, { session, document, plugins: [plugin], uploaders })))"}
editor.destroy()
`)
  run('pnpm', ['install', '--prefer-offline', '--ignore-scripts', '--config.auto-install-peers=false'], consumer)
  const installed = await readdir(join(consumer, 'node_modules/@sword-editor'))
  if (installed.length !== 1 || installed[0] !== framework) throw new Error(`Unexpected SDK dependency: ${installed}`)
  const pkgPath = join(consumer, 'node_modules/@sword-editor', framework)
  const manifest = JSON.parse(await readFile(join(pkgPath, 'package.json'), 'utf8'))
  if (Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).some(name => name.startsWith('@sword-editor/'))) throw new Error('Published component depends on external SDK')
  const declarations = await readFile(join(pkgPath, 'dist/index.d.ts'), 'utf8')
  if (/from\s+['"]@sword-editor\//.test(declarations)) throw new Error('Declarations reference external SDK')
  run('pnpm', ['exec', 'tsc', '--noEmit'], consumer)
  run('pnpm', ['exec', 'vite', 'build'], consumer)
  console.log(`${framework}: component-only install, SDK exports, CSS, types and production build passed`)
}
console.log(`Consumer projects: ${output}`)
