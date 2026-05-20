/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import {
  breakerRegistry,
  getCircuitBreakerHealthSummary,
} from './circuit-breaker-registry.server.ts'
import { CircuitBreaker, CircuitState } from './circuit-breaker.server.ts'

describe('CircuitBreakerRegistry', () => {
  // Clean up registry between tests to prevent cross-test contamination
  afterEach(() => {
    // Unregister all breakers created during tests
    for (const name of breakerRegistry.getNames()) {
      breakerRegistry.unregister(name)
    }
  })

  describe('registration', () => {
    test('registers breakers automatically on construction', () => {
      const breaker = new CircuitBreaker('test-registry-breaker')
      expect(breakerRegistry.get('test-registry-breaker')).toBe(breaker)
      expect(breakerRegistry.count).toBe(1)
    })

    test('tracks multiple breakers', () => {
      new CircuitBreaker('breaker-a')
      new CircuitBreaker('breaker-b')
      new CircuitBreaker('breaker-c')

      expect(breakerRegistry.count).toBe(3)
      expect(breakerRegistry.getNames()).toContain('breaker-a')
      expect(breakerRegistry.getNames()).toContain('breaker-b')
      expect(breakerRegistry.getNames()).toContain('breaker-c')
    })

    test('replaces breaker with same name (re-registration)', () => {
      const first = new CircuitBreaker('duplicate-name')
      const second = new CircuitBreaker('duplicate-name')

      // The second one should replace the first
      expect(breakerRegistry.get('duplicate-name')).toBe(second)
      expect(breakerRegistry.get('duplicate-name')).not.toBe(first)
      expect(breakerRegistry.count).toBe(1)
    })

    test('unregister removes a breaker', () => {
      new CircuitBreaker('removable-breaker')
      expect(breakerRegistry.count).toBe(1)

      breakerRegistry.unregister('removable-breaker')
      expect(breakerRegistry.get('removable-breaker')).toBeUndefined()
      expect(breakerRegistry.count).toBe(0)
    })
  })

  describe('getStats', () => {
    test('returns stats for a registered breaker', () => {
      const breaker = new CircuitBreaker('stats-breaker')
      const stats = breakerRegistry.getStats('stats-breaker')
      expect(stats).toBeDefined()
      expect(stats!.state).toBe(CircuitState.CLOSED)
      expect(stats!.failureCount).toBe(0)
    })

    test('returns undefined for unregistered breaker', () => {
      const stats = breakerRegistry.getStats('nonexistent')
      expect(stats).toBeUndefined()
    })
  })

  describe('getAllStats', () => {
    test('returns stats for all registered breakers', () => {
      new CircuitBreaker('all-stats-a')
      new CircuitBreaker('all-stats-b')

      const allStats = breakerRegistry.getAllStats()
      expect(allStats.size).toBe(2)
      expect(allStats.get('all-stats-a')!.state).toBe(CircuitState.CLOSED)
      expect(allStats.get('all-stats-b')!.state).toBe(CircuitState.CLOSED)
    })
  })

  describe('getCircuitBreakerHealthSummary', () => {
    test('returns summary with correct counts', () => {
      new CircuitBreaker('health-a')
      new CircuitBreaker('health-b')

      const summary = getCircuitBreakerHealthSummary()
      expect(summary.total).toBe(2)
      expect(summary.closed).toBe(2)
      expect(summary.open).toBe(0)
      expect(summary.halfOpen).toBe(0)
      expect(summary.breakers).toHaveLength(2)
    })

    test('tracks OPEN breakers', () => {
      const breaker = new CircuitBreaker('open-breaker', {
        failureThreshold: 3,
        onStateChange: undefined, // suppress default logger noise in test
      })
      breaker.trip()

      const summary = getCircuitBreakerHealthSummary()
      expect(summary.open).toBe(1)
      expect(summary.closed).toBe(0)
      expect(summary.breakers).toHaveLength(1)
      expect(summary.breakers[0]!.state).toBe('OPEN')
    })

    test('breaker entries include all fields', () => {
      new CircuitBreaker('detail-breaker')

      const summary = getCircuitBreakerHealthSummary()
      expect(summary.breakers).toHaveLength(1)
      const entry = summary.breakers[0]!
      expect(entry).toBeDefined()

      expect(entry.name).toBe('detail-breaker')
      expect(entry.state).toBe('CLOSED')
      expect(entry.failureCount).toBe(0)
      expect(entry.totalFailures).toBe(0)
      expect(entry.totalSuccesses).toBe(0)
      expect(entry.totalRejections).toBe(0)
      expect(entry.openedAt).toBeNull()
    })
  })

  describe('resetAll', () => {
    test('resets all breakers to CLOSED', () => {
      const a = new CircuitBreaker('reset-a', {
        onStateChange: undefined,
      })
      const b = new CircuitBreaker('reset-b', {
        onStateChange: undefined,
      })
      a.trip()
      b.trip()
      expect(a.getState()).toBe(CircuitState.OPEN)
      expect(b.getState()).toBe(CircuitState.OPEN)

      breakerRegistry.resetAll()
      expect(a.getState()).toBe(CircuitState.CLOSED)
      expect(b.getState()).toBe(CircuitState.CLOSED)
    })
  })

  describe('tripAll', () => {
    test('trips all breakers to OPEN', () => {
      const a = new CircuitBreaker('trip-a', {
        onStateChange: undefined,
      })
      const b = new CircuitBreaker('trip-b', {
        onStateChange: undefined,
      })

      breakerRegistry.tripAll()
      expect(a.getState()).toBe(CircuitState.OPEN)
      expect(b.getState()).toBe(CircuitState.OPEN)
    })
  })
})
