import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const docsRequire = createRequire(resolve(here, '../../../apps/docs/package.json'))
  const output = process.env.EDITOR_SMOKE_OUTPUT ?? mkdtempSync(join(tmpdir(), 'editor-browser-'))
  await build({
    configFile: false,
    resolve: {
      alias: [
        'react-dom/client',
        'react/jsx-runtime',
        'react-dom',
        'react',
        'vue',
      ].map(name => ({
        find: name,
        replacement: docsRequire.resolve(name),
      })),
    },
    root: resolve(here, '..'),
    define: {
      'process.env.NODE_ENV': '"development"',
      '__VUE_OPTIONS_API__': true,
      '__VUE_PROD_DEVTOOLS__': false,
      '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': false,
    },
    build: {
      outDir: output,
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: join(here, 'browser-smoke.tsx'),
        name: 'EditorSmoke',
        cssFileName: 'smoke',
        formats: ['iife'],
        fileName: () => 'smoke.js',
      },
    },
  })
  writeFileSync(join(output, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="./smoke.css"></head><body><pre id="result">running</pre><script>window.onerror=(message)=>{document.querySelector("#result").textContent=String(message)};window.onunhandledrejection=(event)=>{document.querySelector("#result").textContent=String(event.reason)}</script><script src="./smoke.js"></script></body></html>')
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const profile = mkdtempSync(join(tmpdir(), 'editor-chrome-'))
  const browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--allow-file-access-from-files',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  browser.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const delay = () => new Promise(resolve => setTimeout(resolve, 100))
  let socket
  try {
    let endpoint
    for (let i = 0; i < 100; i++) {
      endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]
      if (endpoint)
        break
      await delay()
    }
    if (!endpoint)
      throw new Error(`Chrome failed to start: ${stderr}`)
    const tabs = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.onopen = resolve
      socket.onerror = reject
    })
    let sequence = 0
    const pending = new Map()
    socket.onmessage = (event) => {
      const response = JSON.parse(event.data)
      const callback = pending.get(response.id)
      if (callback) {
        pending.delete(response.id)
        callback(response)
      }
    }
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, response => response.error
        ? reject(new Error(JSON.stringify(response.error)))
        : resolve(response.result))
      socket.send(JSON.stringify({ id, method, params }))
    })
    await send('Page.navigate', { url: pathToFileURL(join(output, 'index.html')).href })
    let state
    for (let i = 0; i < 300; i++) {
      await delay()
      const response = await send('Runtime.evaluate', { expression: 'JSON.stringify({status:document.body?.dataset.status,text:document.querySelector("#result")?.textContent,html:document.documentElement.outerHTML})', returnByValue: true })
      state = JSON.parse(response.result.value)
      if (state.status === 'passed' || state.status === 'failed')
        break
    }
    writeFileSync(join(output, 'browser-output.html'), state?.html ?? '')
    process.stdout.write(`${state?.text ?? 'No test result'}\n`)
    if (state?.status !== 'passed')
      process.exitCode = 1
  }
  finally {
    socket?.close()
    browser.kill()
  }
  process.stdout.write(`Artifacts: ${output}\n`)
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
