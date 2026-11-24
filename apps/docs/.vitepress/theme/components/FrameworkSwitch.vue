<script setup lang="ts">
import { useRoute, useRouter } from 'vitepress'
/**
 * 侧边栏顶部框架切换器（Arco 风格分段控件）：
 * Vue / React 文档段之间跳转；同名页互切，其余落各自「快速开始」。
 * SDK、图片和画布等共享页面只更新框架偏好，不改变所在编辑器目录。
 */
import { inject } from 'vue'
import { frameworkKey } from '../framework'

type Fw = 'vue' | 'react'

const route = useRoute()
const router = useRouter()

/** 两个框架都有同名文档的页面，可互切 */
const SHARED = [
  'getting-started',
  'doc-editor',
  'tool-bar',
  'editor',
  'custom-blocks',
  'ai',
]

const active = inject(frameworkKey)!

function go(fw: Fw) {
  if (fw === active.value)
    return
  active.value = fw
  if (!/^(?:vue|react)\//.test(route.data.relativePath))
    return
  const name = route.data.relativePath.replace(/^(vue|react)\//, '').replace(/\.md$/, '')
  const target = SHARED.includes(name)
    ? `/${fw}/${name}`
    : `/${fw}/getting-started`
  if (target !== router.route.path)
    router.go(target)
}
</script>

<template>
  <div class="fw-switch">
    <button
      type="button"
      class="fw-btn"
      :class="{ active: active === 'vue' }"
      @click="go('vue')"
    >
      Vue
    </button>
    <button
      type="button"
      class="fw-btn"
      :class="{ active: active === 'react' }"
      @click="go('react')"
    >
      React
    </button>
  </div>
</template>

<style scoped>
/* Arco 风格直角分段：浅灰容器 + 选中白色直角块，无圆角无阴影 */
.fw-switch {
  display: flex;
  margin: 12px 16px 4px;
  padding: 2px;
  background: var(--panel-2);
}

.fw-btn {
  flex: 1;
  padding: 7px 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.fw-btn:hover {
  color: var(--ink-1);
}

.fw-btn.active {
  color: var(--accent);
  background: var(--bg);
}
</style>
