<script setup lang="ts">
import { useRoute, withBase } from 'vitepress'

const route = useRoute()
const entries = [
  { page: 'document', label: '文档编辑器' },
  { page: 'image', label: '图片编辑器' },
  { page: 'canvas', label: '无限画布编辑器' },
  { page: 'rich-text', label: '图文编辑器' },
]
</script>

<template>
  <nav class="playground-navigation" aria-label="切换 Playground 编辑器">
    <a v-for="entry in entries" :key="entry.page" :href="withBase(`/playground/${entry.page}`)" :aria-current="route.path.replace(/\/$/, '') === `/playground/${entry.page}` ? 'page' : undefined">{{ entry.label }}</a>
  </nav>
</template>

<style scoped>
.playground-navigation { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0; }
.playground-navigation a { padding: 8px 16px; border: 1px solid var(--vp-c-divider); border-radius: 6px; text-decoration: none; }
.playground-navigation a[aria-current="page"] { color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); border-color: var(--vp-c-brand-1); }
</style>
