<script setup lang="ts">
import type { Editor, UploadKind } from '@sword-editor/doc-editor'
import type { DocEditorSession } from './session.js'
import { onUnmounted, ref, shallowRef, useAttrs, watch } from 'vue'
import DocEditor from './DocEditor.vue'
import EditorCanvas from './EditorCanvas.vue'
import Toolbar from './Toolbar.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ session?: DocEditorSession, minHeight?: string | number, maxHeight?: string | number }>()
const attrs = useAttrs()
const view = ref<{
  editor: Editor
  toMarkdown: () => string
  insertBlock: (type: string, index: number, focus?: boolean, text?: string) => void
  requestUpload: (index: number, kind: UploadKind) => void
}>()
function setView(value: unknown) {
  view.value = value as typeof view.value
}
defineExpose({
  get editor() { return view.value?.editor },
  toMarkdown: () => view.value?.toMarkdown(),
  insertBlock: (type: string, index: number, focus?: boolean, text?: string) => view.value?.insertBlock(type, index, focus, text),
  requestUpload: (index: number, kind: UploadKind) => view.value?.requestUpload(index, kind),
})
const host = shallowRef<HTMLElement | null>(null)
const owner = {}
let unsubscribe: (() => void) | undefined
let detach: (() => void) | undefined
watch(() => props.session, (session) => {
  unsubscribe?.()
  detach?.()
  host.value = session?.getToolbar() ?? null
  detach = session?.attachContent(owner)
  unsubscribe = session?.subscribe(() => {
    host.value = session.getToolbar()
  })
}, { immediate: true })
onUnmounted(() => {
  unsubscribe?.()
  detach?.()
})
</script>

<template>
  <div>
    <DocEditor v-if="session" :ref="setView" v-bind="attrs" :toolbar="false">
      <Teleport v-if="host" :to="host">
        <Toolbar />
      </Teleport>
      <EditorCanvas :min-height="minHeight" :max-height="maxHeight" />
    </DocEditor>
    <EditorCanvas v-else v-bind="attrs" :min-height="minHeight" :max-height="maxHeight" />
  </div>
</template>
