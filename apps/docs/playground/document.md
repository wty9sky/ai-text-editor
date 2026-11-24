---
sidebar: false
aside: false
pageClass: playground-page
---

<script setup>
import PlaygroundNav from '../components/PlaygroundNav.vue'
import Playground from '../components/Playground.vue'
</script>

# 文档编辑器 Playground

以文本、章节和块操作为起点，体验文档编辑、格式设置与导出。

<PlaygroundNav />

<ClientOnly><Playground mode="document" /></ClientOnly>
