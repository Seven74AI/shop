/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getCircuitBreakerConfig } from './circuit-breaker-config.server.ts'
import type { CircuitBreakerConfig } from './circuit-breaker.server.ts'

describe('getCircuitBreakerConfig', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    // Reset env to a clean state before each test
    process.env = { ...savedEnv }
    // Remove all circuit breaker env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CIRCUIT_BREAKER_')) {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  describe('defaults (no env vars set)', () => {
    test('returns built-in defaults', () => {
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.failureThreshold).toBe(5)
      expect(config.resetTimeoutMs).toBe(30_000)
      expect(config.halfOpenMaxRequests).toBe(1)
    })

    test('uses hardcoded overrides when provided', () => {
      const config = getCircuitBreakerConfig('test-breaker', {
        failureThreshold: 10,
        resetTimeoutMs: 60_000,
      })
      expect(config.failureThreshold).toBe(10)
      expect(config.resetTimeoutMs).toBe(60_000)
      expect(config.halfOpenMaxRequests).toBe(1) // still default
    })
  })

  describe('global env var overrides', () => {
    test('reads global failure threshold', () => {
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '3'
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.failureThreshold).toBe(3)
    })

    test('reads global reset timeout', () => {
      process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS = '60000'
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.resetTimeoutMs).toBe(60_000)
    })

    test('reads global half-open max requests', () => {
      process.env.CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS = '3'
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.halfOpenMaxRequests).toBe(3)
    })
  })

  describe('per-breaker env var overrides', () => {
    test('overrides failure threshold for specific breaker', () => {
      process.env.CIRCUIT_BREAKER_TEST_SERVICE_FAILURE_THRESHOLD = '2'
      const config = getCircuitBreakerConfig('test-service')
      expect(config.failureThreshold).toBe(2)
    })

    test('overrides reset timeout for specific breaker', () => {
      process.env.CIRCUIT_BREAKER_MONDIAL_RELAY_API1_PICKUP_RESET_TIMEOUT_MS =
        '120000'
      const config = getCircuitBreakerConfig('mondial-relay-api1-pickup')
      expect(config.resetTimeoutMs).toBe(120_000)
    })

    test('overrides half-open max requests for specific breaker', () => {
      process.env.CIRCUIT_BREAKER_MY_BREAKER_HALF_OPEN_MAX_REQUESTS = '5'
      const config = getCircuitBreakerConfig('my-breaker')
      expect(config.halfOpenMaxRequests).toBe(5)
    })

    test('per-breaker env var takes priority over global', () => {
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '10'
      process.env.CIRCUIT_BREAKER_SPECIAL_BREAKER_FAILURE_THRESHOLD = '2'
      const config = getCircuitBreakerConfig('special-breaker')
      expect(config.failureThreshold).toBe(2)
    })

    test('per-breaker env var takes priority over hardcoded override', () => {
      process.env.CIRCUIT_BREAKER_OVERRIDE_TEST_FAILURE_THRESHOLD = '7'
      const config: CircuitBreakerConfig = getCircuitBreakerConfig(
        'override-test',
        { failureThreshold: 20 },
      )
      expect(config.failureThreshold).toBe(7)
    })
  })

  describe('name normalization', () => {
    test('normalizes hyphens to underscores', () => {
      process.env.CIRCUIT_BREAKER_MY_BREAKER_FAILURE_THRESHOLD = '8'
      const config = getCircuitBreakerConfig('my-breaker')
      expect(config.failureThreshold).toBe(8)
    })

    test('normalizes dots to underscores', () => {
      process.env.CIRCUIT_BREAKER_SERVICE_V1_FAILURE_THRESHOLD = '3'
      const config = getCircuitBreakerConfig('service.v1')
      expect(config.failureThreshold).toBe(3)
    })
  })

  describe('invalid env var values', () => {
    test('falls back to default for non-numeric values', () => {
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = 'not-a-number'
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.failureThreshold).toBe(5)
    })

    test('falls back to default for negative values', () => {
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '-1'
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.failureThreshold).toBe(5)
    })

    test('falls back to default for empty string', () => {
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = ''
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.failureThreshold).toBe(5)
    })
  })

  describe('onStateChange passthrough', () => {
    test('passes through onStateChange from overrides', () => {
      const callback = () => {}
      const config = getCircuitBreakerConfig('test-breaker', {
        onStateChange: callback,
      })
      expect(config.onStateChange).toBe(callback)
    })

    test('returns undefined onStateChange when not provided', () => {
      const config = getCircuitBreakerConfig('test-breaker')
      expect(config.onStateChange).toBeUndefined()
    })
  })
})
