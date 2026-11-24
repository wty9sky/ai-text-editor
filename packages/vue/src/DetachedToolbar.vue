<script setup lang="ts">
import type { DocEditorSession } from './session.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Toolbar from './Toolbar.vue'

const props = defineProps<{ session?: DocEditorSession }>()
const host = ref<HTMLElement>()
let detach: (() => void) | undefined
let stop: (() => void) | undefined
onMounted(() => {
  stop = watch(() => props.session, (session) => {
    detach?.()
    detach = session?.attachToolbar(host.value!)
  }, { immediate: true, flush: 'post' })
})
onUnmounted(() => {
  stop?.()
  detach?.()
})
</script>

<template>
  <div v-if="session" ref="host" class="sword-editor" />
  <Toolbar v-else />
</template>
