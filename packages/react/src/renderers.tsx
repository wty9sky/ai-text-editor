import type { DocEditorPlugin } from '@sword-editor/doc-editor'
import type { ComponentType } from 'react'
import type { BlockRendererProps } from './types.js'
import { AttachmentBlock } from './blocks/AttachmentBlock.js'
import { ImageBlock } from './blocks/ImageBlock.js'
import { TextBlock } from './blocks/TextBlock.js'
import { VideoBlock } from './blocks/VideoBlock.js'

export const reactRenderersPlugin: DocEditorPlugin = {
  name: 'ui.react.renderers',
  install(ctx) {
    const renderers: Record<string, ComponentType<BlockRendererProps>> = {
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
      divider: () => <hr className="my-3 border-(--line)" />,
    }
    for (const [id, component] of Object.entries(renderers))
      ctx.registerRenderer({ id, framework: 'react', component })
  },
}
