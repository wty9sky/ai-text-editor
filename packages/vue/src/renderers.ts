import type { DocEditorPlugin } from '@sword-editor/doc-editor'
import type { Component } from 'vue'
import AttachmentBlock from './blocks/AttachmentBlock.vue'
import DividerBlock from './blocks/DividerBlock.vue'
import ImageBlock from './blocks/ImageBlock.vue'
import TextBlock from './blocks/TextBlock.vue'
import VideoBlock from './blocks/VideoBlock.vue'

export const vueRenderersPlugin: DocEditorPlugin = {
  name: 'ui.vue.renderers',
  install(ctx) {
    const renderers: Record<string, Component> = {
      paragraph: TextBlock,
      h1: TextBlock,
      h2: TextBlock,
      h3: TextBlock,
      code: TextBlock,
      bullet: TextBlock,
      number: TextBlock,
      quote: TextBlock,
      image: ImageBlock,
      video: VideoBlock,
      attachment: AttachmentBlock,
      divider: DividerBlock,
    }
    for (const [id, component] of Object.entries(renderers))
      ctx.registerRenderer({ id, framework: 'vue', component })
  },
}
