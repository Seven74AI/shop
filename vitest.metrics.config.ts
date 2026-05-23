/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    include: ['./app/utils/metrics.server.test.ts'],
    environment: 'node',
    restoreMocks: true,
    env: {
      CACHE_DATABASE_PATH: '/tmp/shop-test-metrics-v2/cache.db',
      DATABASE_URL: 'file:/tmp/shop-test-metrics-v2/data.db',
      NODE_ENV: 'test',
      MOCKS: 'true',
    },
    server: {
      deps: {
        external: [/node:.*/],
      },
    },
  },
})
