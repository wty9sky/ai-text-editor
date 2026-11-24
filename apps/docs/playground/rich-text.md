---
sidebar: false
aside: false
pageClass: playground-page
---

<script setup>
import PlaygroundNav from '../components/PlaygroundNav.vue'
import Playground from '../components/Playground.vue'
</script>

# 图文编辑器 Playground

基于 DocEditor 的图文组合场景，体验图片、视频、附件、自定义块与文本混排。

<PlaygroundNav />

<ClientOnly><Playground mode="rich-text" /></ClientOnly>
