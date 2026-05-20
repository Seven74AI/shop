/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    include: [
      './app/utils/circuit-breaker.server.test.ts',
      './app/utils/circuit-breaker-config.server.test.ts',
      './app/utils/circuit-breaker-registry.server.test.ts',
      './app/utils/carriers/mondial-relay-api1.server.circuit-breaker.test.ts',
      './app/utils/carriers/mondial-relay-api2.server.circuit-breaker.test.ts',
      './app/routes/api+/admin.circuit-breakers.test.ts',
    ],
    environment: 'node',
    restoreMocks: true,
    env: {
      CACHE_DATABASE_PATH: '/tmp/shop-test/cache.db',
      DATABASE_URL: 'file:/tmp/shop-test/data.db',
      LITEFS_DIR: '/tmp/litefs-test',
      NODE_ENV: 'test',
      CI: 'true',
      MOCKS: 'true',
      SESSION_SECRET: 'test-secret-key-for-testing',
    },
    server: {
      deps: {
        external: [/node:.*/],
      },
    },
  },
})
