---
sidebar: false
aside: false
pageClass: playground-page image-playground-page
title: 图片编辑器 Playground
---

<script setup>
import PlaygroundNav from '../components/PlaygroundNav.vue'
import ImagePlayground from '../components/ImagePlayground.vue'
</script>

<div class="image-playground-heading">
  <h1>图片编辑器 Playground</h1>
  <PlaygroundNav />
</div>

<ClientOnly><ImagePlayground /></ClientOnly>
