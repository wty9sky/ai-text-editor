import type { InjectionKey, Ref } from 'vue'

export type Framework = 'vue' | 'react'
export const frameworkKey: InjectionKey<Ref<Framework>> = Symbol('docs-framework')
