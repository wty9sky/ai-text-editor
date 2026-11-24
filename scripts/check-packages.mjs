import { spawnSync } from 'node:child_process'
import { access, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OBFUSCATION_MARKER } from './obfuscate-config.mjs'
import { PUBLISH_PACKAGES, SDK_PACKAGES } from './publish-config.mjs'

const scoped = process.env.SWORD_PUBLISH_SCOPE === '1'
const cache = await mkdtemp(join(tmpdir(), 'editor-npm-cache-'))
for (const entry of await readdir(new URL('../packages/', import.meta.url), { withFileTypes: true })) {
  if (!entry.isDirectory())
    continue
  const directory = entry.name
  const cwd = new URL(`../packages/${directory}/`, import.meta.url)
  const pkg = JSON.parse(await readFile(new URL('package.json', cwd), 'utf8'))
  if (pkg.private)
    continue
  if (scoped && !PUBLISH_PACKAGES.includes(pkg.name))
    continue
  for (const name of ['README.md', 'LICENSE']) await access(new URL(name, cwd))
  for (const target of Object.values(pkg.exports).flatMap(value => typeof value === 'string'
    ? [value]
    : Object.values(value))) await access(new URL(target, cwd))
  const result = spawnSync('npm', [
    'pack',
    '--dry-run',
    '--json',
    '--ignore-scripts',
  ], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: cache },
  })
  if (result.status !== 0)
    throw new Error(result.stderr)
  const [pack] = JSON.parse(result.stdout)
  if (!pack.files.some(file => file.path.endsWith('.d.ts')))
    throw new Error(`${pkg.name}: missing declarations`)
  if (scoped && SDK_PACKAGES.includes(pkg.name)) {
    for (const file of pack.files.filter(file => file.path.endsWith('.js'))) {
      const source = await readFile(new URL(file.path, cwd), 'utf8')
      if (!source.startsWith(OBFUSCATION_MARKER))
        throw new Error(`${pkg.name}/${file.path}: SDK is not obfuscated`)
    }
  }
  if (['@sword-editor/vue', '@sword-editor/react'].includes(pkg.name)) {
    if (Object.keys({
      ...pkg.dependencies,
      ...pkg.peerDependencies,
    }).some(name => name.startsWith('@sword-editor/'))) {
      throw new Error(`${pkg.name}: SDK must be bundled, not installed by consumers`)
    }
    for (const file of pack.files.filter(file => /\.(?:js|cjs|ts)$/.test(file.path))) {
      const source = await readFile(new URL(file.path, cwd), 'utf8')
      if (/(?:from\s*|import\s*\(|require\s*\()['"]@sword-editor\//.test(source))
        throw new Error(`${pkg.name}/${file.path}: references external SDK`)
    }
  }
  console.log(`${pkg.name}: ${pack.files.length} files, ${pack.size} bytes`)
}
