/** 混淆 SDK 的 tsc 产物：只处理 dist 下的 .js，保留 .d.ts 与所有具名导出。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Obfuscator from 'javascript-obfuscator'
import { OBFUSCATION_MARKER, OBFUSCATION_OPTIONS } from './obfuscate-config.mjs'

const directory = resolve(process.cwd(), process.argv[2] ?? 'dist')
let obfuscated = 0
let skipped = 0

async function walk(current) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name)
    if (entry.isDirectory()) {
      await walk(path)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.js'))
      continue
    const source = await readFile(path, 'utf8')
    if (source.startsWith(OBFUSCATION_MARKER)) {
      skipped++
      continue
    }
    const code = Obfuscator.obfuscate(source, OBFUSCATION_OPTIONS).getObfuscatedCode()
    await writeFile(path, `${OBFUSCATION_MARKER}\n${code}\n`, 'utf8')
    obfuscated++
  }
}

await walk(directory)
console.log(`${directory}: obfuscated ${obfuscated} JS files, skipped ${skipped} already obfuscated`)
