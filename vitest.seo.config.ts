import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['./app/utils/seo-meta.test.ts'],
    globalSetup: [],
    setupFiles: [],
  },
})
