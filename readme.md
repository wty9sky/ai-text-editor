# AiEditor Monorepo

这是一个基于 Monorepo 架构的 AI 编辑器项目，集成了 Web 端编辑器、博客 AI 生成工具以及后端 API 服务。

## 目录结构

```
AiEditor/
├── apps/
│   ├── editor-vue/    # Vue 3 + Vite + TailwindCSS 编辑器前端 (Port: 3001)
│   ├── blog-ai/       # React + Vite + TailwindCSS 博客 AI 工具 (Port: 3002)
│   └── api/           # NestJS 后端服务 (Port: 3000)
├── packages/
│   └── editor/        # 编辑器 SDK (Core + Tiptap implementation)
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始

### 前置要求

- Node.js >= 18
- pnpm >= 9

### 安装依赖

```bash
pnpm install
```

### 启动项目

可以在根目录使用 `pnpm -r` 命令，或者进入各个目录单独启动。

**启动 API:**
```bash
cd apps/api
pnpm start:dev
```

**启动 Editor Vue:**
```bash
cd apps/editor-vue
pnpm dev
```

**启动 Blog AI:**
```bash
cd apps/blog-ai
pnpm dev
```

## 开发指南

本项目使用 pnpm workspace 管理依赖。
- `apps/*`: 存放应用程序
- `packages/*`: 存放共享库和核心模块
