import type { AiAdapter, Exporter, Uploader } from './extensions.js'
import type { DocEditorPlugin } from './plugin.js'
import { createAiActions } from './ai.js'
/** Shared configuration-to-plugin adapter; framework wrappers only supply their views/exporters. */
export function createFeaturePlugins(options: {
  exporters?: Exporter[]
  uploaders?: Uploader[]
  ai?: AiAdapter
  plugins?: DocEditorPlugin[]
}): DocEditorPlugin[] {
  const plugins: DocEditorPlugin[] = []
  if (options.exporters?.length) {
    plugins.push({
      name: 'builtin.exporters',
      install(ctx) {
        for (const item of options.exporters!)
          ctx.registerExporter(item, { override: true })
      },
    })
  }
  if (options.uploaders?.length) {
    plugins.push({
      name: 'builtin.uploaders',
      install(ctx) {
        for (const item of options.uploaders!)
          ctx.registerUploader(item)
      },
    })
  }
  if (options.ai) {
    plugins.push({
      name: 'builtin.ai',
      install(ctx) {
        for (const item of createAiActions(options.ai!))
          ctx.registerAiAction(item)
      },
    })
  }
  return [
    ...plugins,
    ...options.plugins ?? [],
  ]
}
