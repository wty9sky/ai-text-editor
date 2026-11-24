<script setup lang="ts">
import { ImageEditor } from '@sword-editor/vue'

const artboard = {
  format: 'site.image-document' as const,
  version: 1 as const,
  id: 'playground-artboard',
  width: 1000,
  height: 1000,
  background: '#ffffff',
  layers: [],
}
</script>

<template>
  <ImageEditor :initial-document="artboard" />
</template>
