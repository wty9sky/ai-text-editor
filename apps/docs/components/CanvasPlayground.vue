<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { CanvasEditor } from '../../../packages/canvas-editor/src/index'

const editor = shallowRef<CanvasEditor>()
const revision = ref(0)
const selected = ref('')
let off: (() => void) | undefined
const downloads = new Map<string, ReturnType<typeof setTimeout>>()
const scene = computed(() => {
  void revision.value
  return editor.value?.document
})
onMounted(() => {
  editor.value = new CanvasEditor()
  off = editor.value.on(() => {
    revision.value++
  })
  add()
})
onUnmounted(() => {
  for (const [url, timer] of downloads) {
    clearTimeout(timer)
    URL.revokeObjectURL(url)
  }
  downloads.clear()
  off?.()
  editor.value?.destroy()
})
function add() {
  const id = crypto.randomUUID()
  const count = editor.value!.document.nodes.length
  editor.value!.execute('node.add', {
    id,
    type: 'note',
    x: 80 + count * 40,
    y: 80 + count * 40,
    width: 180,
    height: 100,
    data: { text: `节点 ${count + 1}` },
  })
  selected.value = id
}
function zoom(factor: number) {
  const viewport = editor.value!.document.viewport
  editor.value!.execute('viewport.set', {
    ...viewport,
    zoom: Math.max(0.25, Math.min(3, viewport.zoom * factor)),
  })
}
function move(dx: number, dy: number) {
  const node = scene.value?.nodes.find(node => node.id === selected.value)
  if (node) {
    editor.value!.execute('node.update', {
      id: node.id,
      patch: { x: node.x + dx, y: node.y + dy },
    })
  }
}
function pan(dx: number) {
  const viewport = editor.value!.document.viewport
  editor.value!.execute('viewport.set', { ...viewport, x: viewport.x + dx })
}
function download() {
  const url = URL.createObjectURL(new Blob([
    JSON.stringify(scene.value, null, 2),
  ], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'canvas.json'
  link.click()
  downloads.set(url, setTimeout(() => {
    URL.revokeObjectURL(url)
    downloads.delete(url)
  }, 1000))
}
</script>

<template>
  <section class="playground-workbench" aria-label="无限画布编辑器">
    <div class="playground-controls">
      <button @click="add">
        添加节点
      </button><button :disabled="!selected" @click="editor?.execute('node.remove', selected); selected = ''">
        删除节点
      </button>
      <button :disabled="!editor?.canUndo" @click="editor?.undo()">
        撤销
      </button><button :disabled="!editor?.canRedo" @click="editor?.redo()">
        重做
      </button>
      <button @click="zoom(1.2)">
        放大
      </button><button @click="zoom(1 / 1.2)">
        缩小
      </button>
      <button @click="pan(80)">
        向右平移
      </button><button @click="pan(-80)">
        向左平移
      </button>
      <button @click="download">
        保存场景
      </button>
    </div>
    <div class="playground-controls">
      <span>移动选中节点</span><button :disabled="!selected" @click="move(-20, 0)">
        ←
      </button><button :disabled="!selected" @click="move(20, 0)">
        →
      </button><button :disabled="!selected" @click="move(0, -20)">
        ↑
      </button><button :disabled="!selected" @click="move(0, 20)">
        ↓
      </button>
      <span>{{ Math.round((scene?.viewport.zoom ?? 1) * 100) }}%</span>
    </div>
    <svg viewBox="0 0 1000 560" aria-label="节点画布" @click.self="selected = ''">
      <g v-if="scene" :transform="`translate(${scene.viewport.x},${scene.viewport.y}) scale(${scene.viewport.zoom})`">
        <g v-for="node in scene.nodes" :key="node.id" :transform="`translate(${node.x},${node.y})`" role="button" tabindex="0" :aria-label="String(node.data.text)" @click="selected = node.id" @keydown.enter.prevent="selected = node.id" @keydown.space.prevent="selected = node.id">
          <rect :width="node.width" :height="node.height" rx="8" fill="var(--vp-c-bg)" :stroke="selected === node.id ? 'var(--vp-c-brand-1)' : 'var(--vp-c-divider)'" stroke-width="2" />
          <text x="16" y="36" fill="var(--vp-c-text-1)">{{ node.data.text }}</text>
        </g>
      </g>
    </svg>
  </section>
</template>
