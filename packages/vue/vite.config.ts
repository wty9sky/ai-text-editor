import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

/** SDK、runtime、图标与导出依赖随组件库打包，宿主只提供 Vue。 */
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    dts({
      rollupTypes: true,
      bundledPackages: ['@sword-editor/image-editor', '@sword-editor/doc-editor', '@sword-editor/runtime'],
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'DocEditorVue',
      fileName: 'index',
      cssFileName: 'style',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        exports: 'named',
      },
    },
  },
})
