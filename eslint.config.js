import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  ignores: [
    '**/dist/**',
    '**/build/**',
    '**/.output/**',
    '**/.nuxt/**',
    '**/.astro/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/.vitepress/cache/**',
    '**/components.d.ts',
    '**/src/generated/**',
  ],
}, {
  rules: {
    'ts/consistent-type-definitions': ['error', 'interface'],
    'node/prefer-global/process': 'off',
    'no-console': 'warn',
    'ts/no-use-before-define': 'off',
    'vue/custom-event-name-casing': 'off',
    'node/prefer-global/buffer': 'off',
    'ts/no-empty-object-type': 'off',
  },
})
