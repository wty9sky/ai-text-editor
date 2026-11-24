<script setup lang="ts">
import type { ImageDocument } from '@sword-editor/image-editor'
import { mountImageWorkbench } from '@sword-editor/image-editor'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ initialDocument?: ImageDocument }>()
const host = ref<HTMLElement>()
let workbench: ReturnType<typeof mountImageWorkbench> | undefined
onMounted(() => {
  workbench = mountImageWorkbench(host.value!, props.initialDocument)
})
onBeforeUnmount(() => workbench?.destroy())
</script>

<template>
  <div ref="host" />
</template>
