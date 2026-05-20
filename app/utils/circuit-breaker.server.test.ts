/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest'
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
} from './circuit-breaker.server.ts'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker<[string], string>

  beforeEach(() => {
    vi.useFakeTimers()
    breaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeoutMs: 5000,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    test('starts in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED)
    })

    test('has zero failures initially', () => {
      const stats = breaker.getStats()
      expect(stats.failureCount).toBe(0)
      expect(stats.successCount).toBe(0)
      expect(stats.totalFailures).toBe(0)
      expect(stats.totalSuccesses).toBe(0)
      expect(stats.totalRejections).toBe(0)
    })
  })

  describe('successful calls (CLOSED state)', () => {
    test('calls the function and returns its result', async () => {
      const result = await breaker.fire(async () => 'success')
      expect(result).toBe('success')
    })

    test('resets failure count after success', async () => {
      // Cause one failure
      await breaker.fire(async () => {
        throw new Error('transient')
      }).catch(() => {})
      expect(breaker.getStats().failureCount).toBe(1)

      // Then succeed
      await breaker.fire(async () => 'ok')
      expect(breaker.getStats().failureCount).toBe(0)
    })

    test('increments success and total counters', async () => {
      await breaker.fire(async () => 'ok')
      await breaker.fire(async () => 'ok2')
      const stats = breaker.getStats()
      expect(stats.successCount).toBe(2)
      expect(stats.totalSuccesses).toBe(2)
    })
  })

  describe('failure and circuit opening', () => {
    test('opens circuit after reaching failureThreshold consecutive failures', async () => {
      for (let i = 0; i < 3; i++) {
        await breaker.fire(async () => {
          throw new Error(`fail ${i}`)
        }).catch(() => {})
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN)
    })

    test('does NOT open circuit if failures are interleaved with successes', async () => {
      await breaker.fire(async () => {
        throw new Error('fail1')
      }).catch(() => {})

      await breaker.fire(async () => 'ok') // reset counter

      await breaker.fire(async () => {
        throw new Error('fail2')
      }).catch(() => {})

      await breaker.fire(async () => {
        throw new Error('fail3')
      }).catch(() => {})

      // Still CLOSED because counter was reset after first success
      expect(breaker.getState()).toBe(CircuitState.CLOSED)
    })

    test('rejects calls when circuit is OPEN', async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.fire(async () => {
          throw new Error(`fail ${i}`)
        }).catch(() => {})
      }

      await expect(breaker.fire(async () => 'should reject')).rejects.toThrow(
        CircuitOpenError,
      )
      await expect(breaker.fire(async () => 'should reject')).rejects.toThrow(
        'test-service',
      )
    })

    test('increments totalRejections for OPEN-state rejections', async () => {
      for (let i = 0; i < 3; i++) {
        await breaker.fire(async () => {
          throw new Error(`fail ${i}`)
        }).catch(() => {})
      }

      expect(breaker.getStats().totalRejections).toBe(0)

      await breaker.fire(async () => 'rejected').catch(() => {})
      await breaker.fire(async () => 'rejected').catch(() => {})

      expect(breaker.getStats().totalRejections).toBe(2)
    })
  })

  describe('half-open state', () => {
    test('transitions to HALF_OPEN after resetTimeout', async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await breaker.fire(async () => {
          throw new Error(`fail ${i}`)
        }).catch(() => {})
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN)

      // Fast-forward past reset timeout
      vi.advanceTimersByTime(6000)

      // Next call should try HALF_OPEN
      const result = await breaker.fire(async () => 'half-open-ok')
      expect(result).toBe('half-open-ok')
    })

    test('closes circuit after successful HALF_OPEN call', async () => {
      for (let i = 0; i < 3; i++) {
        await breaker.fire(async () => {
          throw new Error(`fail ${i}`)
        }).catch(() => {})
      }

      vi.advanceTimersByTime(6000)

      const statsBefore = breaker.getStats()
      expect(statsBefore.state).toBe(CircuitState.OPEN)

      await breaker.fire(async () => 'ok')

      expect(breaker.getState()).toBe(CircuitState.CLOSED)
    })

    test('re-opens circuit after failed HALF_OPEN call', async () => {
      for (let i = 0; i < 3; i++) {
        await breaker.fire(async () => {
          throw new Error(`fail ${i}`)
        }).catch(() => {})
      }

      vi.advanceTimersByTime(6000)

      await breaker.fire(async () => {
        throw new Error('half-open-fail')
      }).catch(() => {})

      expect(breaker.getState()).toBe(CircuitState.OPEN)
    })

    test('limits concurrent requests in HALF_OPEN', async () => {
      const concurrentBreaker = new CircuitBreaker('concurrent-test', {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        halfOpenMaxRequests: 1,
      })

      // Trip
      await concurrentBreaker.fire(async () => {
        throw new Error('fail')
      }).catch(() => {})

      vi.advanceTimersByTime(2000)

      // State transition happens lazily inside fire() — trigger it
      // Need to start fire() to trigger HALF_OPEN transition
      // First, verify we can enter HALF_OPEN
      const firstCallAllowed = concurrentBreaker.fire(
        async () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('slow-ok'), 5000),
          ),
      )
      // Check state after fire() triggers the transition
      expect(concurrentBreaker.getState()).toBe(CircuitState.HALF_OPEN)

      // Second call should be rejected (halfOpenMaxRequests=1)
      await expect(
        concurrentBreaker.fire(async () => 'rejected'),
      ).rejects.toThrow(CircuitOpenError)

      // Let the first call complete
      vi.advanceTimersByTime(6000)
      const result = await firstCallAllowed
      expect(result).toBe('slow-ok')
    })
  })

  describe('manual trip and reset', () => {
    test('trip() forces circuit to OPEN', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED)
      breaker.trip()
      expect(breaker.getState()).toBe(CircuitState.OPEN)
    })

    test('trip() is idempotent', () => {
      breaker.trip()
      breaker.trip()
      expect(breaker.getState()).toBe(CircuitState.OPEN)
    })

    test('reset() forces circuit to CLOSED and clears counters', async () => {
      breaker.trip()
      expect(breaker.getState()).toBe(CircuitState.OPEN)

      breaker.reset()
      expect(breaker.getState()).toBe(CircuitState.CLOSED)

      const stats = breaker.getStats()
      expect(stats.failureCount).toBe(0)
    })

    test('reset() is idempotent', () => {
      breaker.reset()
      breaker.reset()
      expect(breaker.getState()).toBe(CircuitState.CLOSED)
    })
  })

  describe('CircuitOpenError', () => {
    test('includes circuit name and openedAt in message', () => {
      breaker.trip()
      const error = new CircuitOpenError('my-service', Date.now())
      expect(error.circuitName).toBe('my-service')
      expect(error.message).toContain('my-service')
      expect(error.message).toContain('OPEN')
      expect(error.name).toBe('CircuitOpenError')
    })
  })

  describe('state change callback', () => {
    test('calls onStateChange on transitions', () => {
      const stateChanges: Array<{ from: CircuitState; to: CircuitState }> = []
      const cbBreaker = new CircuitBreaker('cb-test', {
        failureThreshold: 1,
        onStateChange: (from, to) => stateChanges.push({ from, to }),
      })

      cbBreaker.trip()
      expect(stateChanges).toEqual([
        { from: CircuitState.CLOSED, to: CircuitState.OPEN },
      ])

      cbBreaker.reset()
      expect(stateChanges).toEqual([
        { from: CircuitState.CLOSED, to: CircuitState.OPEN },
        { from: CircuitState.OPEN, to: CircuitState.CLOSED },
      ])
    })

    test('does not throw if onStateChange throws', () => {
      const cbBreaker = new CircuitBreaker('cb-test', {
        failureThreshold: 1,
        onStateChange: () => {
          throw new Error('callback error')
        },
      })

      // Should not throw
      expect(() => cbBreaker.trip()).not.toThrow()
      expect(cbBreaker.getState()).toBe(CircuitState.OPEN)
    })
  })

  describe('name property', () => {
    test('stores and returns the circuit name', () => {
      expect(breaker.name).toBe('test-service')
    })
  })
})
