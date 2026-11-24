import type { Theme } from 'vitepress'
import type { Framework } from './framework'
import { dataSymbol, useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { computed, defineComponent, h, onMounted, provide, ref, watch } from 'vue'
import FrameworkSwitch from './components/FrameworkSwitch.vue'
import { frameworkKey } from './framework'
import './style.css'
// React 组件的基础样式（编译产物：Tailwind 工具类 + 主题变量）
// eslint-disable-next-line antfu/no-import-dist -- The docs consume the published React stylesheet.
import '../../../../packages/react/dist/style.css'

export default {
  extends: DefaultTheme,
  Layout: defineComponent({
    setup() {
      const data = useData()
      const framework = ref<Framework>('vue')
      watch(() => data.page.value.relativePath, (path) => {
        if (path.startsWith('react/'))
          framework.value = 'react'
        else if (path.startsWith('vue/'))
          framework.value = 'vue'
      }, { immediate: true, flush: 'sync' })
      onMounted(() => {
        if (!/^(?:vue|react)\//.test(data.page.value.relativePath)) {
          try {
            if (sessionStorage.getItem('docs-framework') === 'react')
              framework.value = 'react'
          }
          catch {}
        }
        else {
          try {
            sessionStorage.setItem('docs-framework', framework.value)
          }
          catch {}
        }
      })
      watch(framework, (value) => {
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('docs-framework', value)
          }
          catch {}
        }
      })
      provide(frameworkKey, framework)
      provide(dataSymbol, {
        ...data,
        theme: computed(() => {
          const theme = data.theme.value
          return {
            ...theme,
            sidebar: {
              ...theme.sidebar,
              '/sdk/': theme.sidebar[`/${framework.value}/`],
            },
          }
        }),
      })
      return () => h(DefaultTheme.Layout, null, {
        'sidebar-nav-before': () => h(FrameworkSwitch),
      })
    },
  }),
} satisfies Theme
