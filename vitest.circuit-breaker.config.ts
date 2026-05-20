/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    include: [
      './app/utils/circuit-breaker.server.test.ts',
      './app/utils/circuit-breaker-config.server.test.ts',
      './app/utils/circuit-breaker-registry.server.test.ts',
    ],
    environment: 'node',
    restoreMocks: true,
    server: {
      deps: {
        external: [/node:.*/],
      },
    },
  },
})
