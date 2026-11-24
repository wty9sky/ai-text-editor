/** 发布范围构建 / 校验 / 打包 / 发布编排：只处理 publish-config 中列出的包。 */
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGE_DIRS, PUBLISH_PACKAGES, SDK_PACKAGES } from './publish-config.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.argv[2]
const filters = PUBLISH_PACKAGES.flatMap(name => ['--filter', name])

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  })
  if (result.error)
    throw result.error
  if (result.status !== 0)
    process.exit(result.status ?? 1)
}

function build() {
  run('pnpm', ['-r', ...filters, 'run', 'build'])
}

function check() {
  build()
  run('pnpm', ['-r', ...filters, 'run', 'typecheck'])
  for (const name of SDK_PACKAGES) run('pnpm', ['--filter', name, 'run', 'test'])
  run('node', ['scripts/check-packages.mjs'], {
    env: { SWORD_PUBLISH_SCOPE: '1' },
  })
  run('node', ['scripts/verify-component-packages.mjs'])
}

async function pack() {
  check()
  const destination = join(root, '.artifacts', 'npm')
  await mkdir(destination, { recursive: true })
  for (const name of PUBLISH_PACKAGES) {
    run('pnpm', ['pack', '--pack-destination', destination], {
      cwd: join(root, 'packages', PACKAGE_DIRS[name]),
    })
  }
  console.log(`tarballs: ${destination}`)
}

function publish() {
  check()
  for (const name of PUBLISH_PACKAGES) {
    run('pnpm', [
      'publish',
      '--access',
      'public',
      '--no-git-checks',
    ], {
      cwd: join(root, 'packages', PACKAGE_DIRS[name]),
    })
  }
}

if (mode === 'build')
  build()
else if (mode === 'check')
  check()
else if (mode === 'pack')
  await pack()
else if (mode === 'publish')
  publish()
else throw new Error(`Unknown mode "${mode ?? ''}". Use build | check | pack | publish.`)
