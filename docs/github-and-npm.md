# GitHub 部署与 NPM 发布

## 1. 发布范围

本次只打包并发布文档编辑器、图片编辑器及其框架组件；无限画布 SDK 不参与打包和发布。

| 包 | 类型 | 是否发布 |
| --- | --- | --- |
| `@sword-editor/runtime` | SDK 公共运行时 | 是（SDK 依赖） |
| `@sword-editor/doc-editor` | 文档编辑器 SDK | 是 |
| `@sword-editor/image-editor` | 图片编辑器 SDK | 是 |
| `@sword-editor/vue` | Vue 3 组件（内置文档 / 图片 SDK） | 是 |
| `@sword-editor/react` | React 组件（内置文档 / 图片 SDK） | 是 |
| `@sword-editor/canvas-editor` | 无限画布 SDK | 否 |
| `@sword-editor/docs` | 文档站 | 否（只部署 GitHub Pages） |

范围由 `scripts/publish-config.mjs` 单一维护，`scripts/release-packages.mjs` 和 `scripts/check-packages.mjs` 都从它读取清单，工作流不重复写包名。

## 2. GitHub 部署方案

| 工作流 | 触发 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | 推送到 `master` / `main`、任意 PR | `pnpm install --frozen-lockfile` → 全仓构建 → 类型检查 → 测试 → 文档站构建 → 包内容检查 |
| `.github/workflows/deploy-docs.yml` | 推送到 `master` / `main`、`workflow_dispatch` | 构建工作区与文档站，上传 Pages artifact 并部署 |
| `.github/workflows/publish-npm.yml` | GitHub Release 发布、`workflow_dispatch`（需输入 `publish`） | 仅构建 / 校验 / 打包上表 5 个包，再发布到 npm |

一次性准备：

1. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
2. 仓库 Settings → Secrets and variables → Actions → New repository secret，新增 `NPM_TOKEN`，值为具有 `Automation` 权限的 npm token（不要用账号密码）。发布工作流用它作为 `NODE_AUTH_TOKEN`；`.npmrc` 中不写入任何 token。
3. 若站点使用自定义域名，新增 repository variable `DOCS_BASE=/`；默认按项目页处理，基础路径为 `/<仓库名>/`。该值在构建时注入 VitePress 的 `base`。
4. 建议给 `master` / `main` 开启分支保护，要求 CI 通过后再合并；发布只允许维护者创建 Release。
5. 本地首次推送前确认 `@sword-editor` npm scope 权限和版本号未被占用；当前包版本均为 `0.1.0`。

部署产物来自 `apps/docs/.vitepress/dist`，不包含 SDK 源码。组件包 `@sword-editor/vue`、`@sword-editor/react` 在构建期把文档 / 图片 SDK 内联进产物，消费者只需安装一个组件包。

## 3. 将更新提交到 GitHub 的完整流程

当前仓库状态：分支 `master`，**未配置 remote、未产生提交**，工作区文件全部未跟踪。按下面顺序执行。

### 3.1 首次推送

```sh
cd /Users/wangtianyang/Documents/Projects/DevApps/Editor

# 1. 本地自检（构建、类型、测试、包内容）
pnpm install
pnpm release:check

# 2. 确认待提交内容；node_modules / dist / .artifacts / local-docs 已被 .gitignore 排除
git status --short

git add .
git commit -m "chore: bootstrap editor monorepo with GitHub workflows"

# 3. 认证并创建远端仓库（gh 未安装时先 brew install gh）
gh auth login
gh repo create sword-editor --public --source=. --remote=origin --push
```

如果远端仓库已存在，跳过 `gh repo create`，改用：

```sh
git remote add origin git@github.com:<OWNER>/<REPO>.git
git push -u origin master
```

推送后打开仓库的 Actions 页确认 CI 与 Deploy docs 运行成功；Pages 首次部署需要等待数十秒，访问地址见仓库 Settings → Pages。

远端地址确定后，建议把 `repository` / `homepage` / `bugs` 补进上述 5 个包的 `package.json`（当前未填写，不影响发布本身）。

### 3.2 日常更新

```sh
git switch master
git pull --rebase origin master

git switch -c feature/<简短说明>
# 修改代码
pnpm release:check
git add <改动文件>
git commit -m "feat: <说明>"
git push -u origin feature/<简短说明>

# 在 GitHub 上创建 PR，CI 通过后合并到 master
```

合并后主分支会再次触发 CI 和文档站部署；文档站地址不需要手工上传任何文件。

### 3.3 发版与发布到 npm

```sh
# 1. 同步升级 5 个包的 version（保持发布范围一致），并刷新 lockfile
pnpm install
pnpm release:scope:check      # 范围构建 + 类型 + SDK 测试 + 包检查 + 消费工程验证
pnpm release:scope:pack       # 生成 .artifacts/npm/*.tgz，可先本地安装验证

git add .
git commit -m "chore: release v0.1.1"
git push origin master

# 2. 创建 Release（此动作触发 publish-npm.yml）
git tag v0.1.1
git push origin v0.1.1
gh release create v0.1.1 --title "v0.1.1" --generate-notes
```

仅推送 tag 不会触发发布；必须是 GitHub Release 的 `published` 事件，或在 Actions 中手动运行 `Publish npm` 并输入 `publish`。发布顺序由 `scripts/release-packages.mjs` 控制：先 runtime，再 doc-editor / image-editor，最后 vue / react；无限画布不会被发布。

## 4. NPM 打包与混淆配置

### 4.1 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm release:scope:build` | 只构建 5 个发布包（按依赖拓扑顺序，SDK 构建后自动混淆） |
| `pnpm release:scope:check` | 上述构建 + 类型检查 + SDK 测试 + 包内容 / 混淆检查 + Vue/React 独立消费工程验证 |
| `pnpm release:scope:pack` | 在校验通过后用 `pnpm pack` 生成 tarball 到 `.artifacts/npm/` |
| `pnpm release:scope:publish` | 在校验通过后逐个执行 `pnpm publish --access public --no-git-checks`（需 `NPM_TOKEN`） |

`workspace:^` 依赖由 `pnpm pack` / `pnpm publish` 自动改写为实际版本范围，不要用 `npm pack` 替代。

### 4.2 混淆为何不破坏 import

- `packages/{runtime,doc-editor,image-editor}/package.json` 的 `build` 为 `tsc -p tsconfig.json && node ../../scripts/obfuscate-dist.mjs dist`：tsc 先产出 ESM 与 `.d.ts`，脚本只混淆 `dist` 下的 `.js`，声明文件保持原样。
- 混淆选项集中在 `scripts/obfuscate-config.mjs`：`renameGlobals: false` 保留 `Editor`、`definePlugin`、`mountImageWorkbench` 等具名导出；`renameProperties: false`、`transformObjectKeys: false` 保留对象键；`target: browser-no-eval` 且 `stringArrayEncoding: []`、`selfDefending: false`、`debugProtection: false`，不引入 eval、反调试和 CSP 冲突。
- 包的 `exports` 仍指向 `./dist/index.js` 与 `./dist/index.d.ts`；每个被混淆文件带 `/* sword-editor:obfuscated */` 标记，`SWORD_PUBLISH_SCOPE=1 node scripts/check-packages.mjs` 会校验该标记，防止漏混淆。
- Vue / React 包在 Vite 构建时内联已混淆的 SDK 代码，`vite-plugin-dts` 把 SDK 类型打进 `dist/index.d.ts`，因此消费者不会安装任何 `@sword-editor/*` SDK 作为外部依赖。

### 4.3 安装与调用方式（API 不变）

```ts
// 独立使用文档 / 图片 SDK
import { Editor, DEFAULT_PLUGINS, definePlugin } from '@sword-editor/doc-editor'
import type { EditorDocument } from '@sword-editor/doc-editor'
import { mountImageWorkbench } from '@sword-editor/image-editor'
import type { ImageDocument } from '@sword-editor/image-editor'

const editor = new Editor({ plugins: DEFAULT_PLUGINS })
const doc: EditorDocument = editor.toDocument()
editor.destroy()
```

```vue
<script setup lang="ts">
import { DocEditor, ImageEditor, Editor } from '@sword-editor/vue'
import '@sword-editor/vue/style.css'
</script>
```

```tsx
import { DocEditor, ImageEditor, Editor } from '@sword-editor/react'
import '@sword-editor/react/style.css'
```

`watch` 脚本使用未混淆的 tsc/vite 输出，仅供本地开发；发布一律走 `release:scope:*`。混淆用于提高阅读和复制成本，不构成安全边界，也不要把凭据写进 SDK。

## 5. 发布前验收清单

- `pnpm release:check`：全仓构建、类型、测试、文档站与包内容检查通过。
- `pnpm release:scope:check`：发布范围独立构建、SDK 测试、混淆标记、Vue / React 独立消费工程（类型 + CSS + 生产构建）通过。
- 打开 `.artifacts/npm/` 中任一 tarball，确认没有 `canvas-editor`，SDK 的 `dist/*.js` 为混淆产物且 `dist/*.d.ts` 存在。
- GitHub Actions 中 CI、Deploy docs 通过，Pages 地址可访问；NPM Token 有效且 `@sword-editor` scope 可发布。
