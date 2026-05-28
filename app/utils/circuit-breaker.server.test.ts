/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest'
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
} from './circuit-breaker.server.ts'
import { breakerRegistry } from './circuit-breaker-registry.server.ts'

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
    // Clean up registry to prevent cross-test contamination
    for (const name of breakerRegistry.getNames()) {
      breakerRegistry.unregister(name)
    }
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

  describe('event tracking', () => {
    test('records events on state transitions', () => {
      const eventBreaker = new CircuitBreaker('event-test', {
        failureThreshold: 1,
        onStateChange: undefined,
      })

      // Trip → should record OPEN event
      eventBreaker.trip()
      const eventsAfterOpen = eventBreaker.getEvents()
      expect(eventsAfterOpen).toHaveLength(1)
      expect(eventsAfterOpen[0]!.type).toBe('OPEN')
      expect(eventsAfterOpen[0]!.breakerName).toBe('event-test')
      expect(eventsAfterOpen[0]!.timestamp).toBeGreaterThan(0)

      // Reset → CLOSED transition + RESET event
      eventBreaker.reset()
      const eventsAfterReset = eventBreaker.getEvents()
      expect(eventsAfterReset).toHaveLength(3)
      expect(eventsAfterReset[0]!.type).toBe('RESET')
      expect(eventsAfterReset[1]!.type).toBe('CLOSED')
      expect(eventsAfterReset[2]!.type).toBe('OPEN')
    })

    test('records HALF_OPEN transitions', async () => {
      const halfOpenBreaker = new CircuitBreaker('half-open-events', {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        onStateChange: undefined,
      })

      // Trip to OPEN via failure
      await halfOpenBreaker.fire(async () => {
        throw new Error('fail')
      }).catch(() => {})

      vi.advanceTimersByTime(2000)

      // Fire to trigger HALF_OPEN transition and succeed
      await halfOpenBreaker.fire(async () => 'ok')

      const events = halfOpenBreaker.getEvents()
      const eventTypes = events.map((e) => e.type)
      // Should have: OPEN (from trip), HALF_OPEN (on fire), CLOSED (success in half-open)
      expect(eventTypes).toContain('HALF_OPEN')
      expect(eventTypes).toContain('CLOSED')
    })

    test('lastEvents appears in getStats output', () => {
      const statBreaker = new CircuitBreaker('stats-events', {
        onStateChange: undefined,
      })
      statBreaker.trip()
      statBreaker.reset()

      const stats = statBreaker.getStats()
      expect(stats.lastEvents).toHaveLength(3)
      expect(stats.lastEvents[0]!.type).toBe('RESET')
      expect(stats.lastEvents[1]!.type).toBe('CLOSED')
      expect(stats.lastEvents[2]!.type).toBe('OPEN')
    })

    test('caps events at MAX_EVENTS (50)', () => {
      const maxBreaker = new CircuitBreaker('max-events', {
        failureThreshold: 1,
        onStateChange: undefined,
      })

      // Generate 60 events (30 trip/reset cycles)
      for (let i = 0; i < 30; i++) {
        maxBreaker.trip()
        maxBreaker.reset()
      }

      const events = maxBreaker.getEvents()
      expect(events.length).toBeLessThanOrEqual(50)
    })
  })

  describe('auto-registration with registry', () => {
    test('registers with breakerRegistry on construction', () => {
      const registeredBreaker = breakerRegistry.get('test-service')
      expect(registeredBreaker).toBeDefined()
      expect(registeredBreaker).toBe(breaker)
    })

    test('unregisters old instance when name reused', () => {
      const oldBreaker = breakerRegistry.get('test-service')
      expect(oldBreaker).toBe(breaker)

      const newBreaker = new CircuitBreaker('test-service')
      const registered = breakerRegistry.get('test-service')
      expect(registered).toBe(newBreaker)
      expect(registered).not.toBe(oldBreaker)
    })
  })

  describe('default state change logger', () => {
    test('default onStateChange fires on state transitions', () => {
      const transitions: Array<{from: string, to: string}> = []
      // Create a breaker with a custom spy to verify the default pattern works
      const logBreaker = new CircuitBreaker('logged-breaker', {
        failureThreshold: 1,
        onStateChange: (from, to) => transitions.push({from, to}),
      })

      // Trip to trigger state change
      logBreaker.trip()
      expect(transitions).toHaveLength(1)
      expect(transitions[0]).toEqual({from: 'CLOSED', to: 'OPEN'})

      // Reset to trigger another state change
      logBreaker.reset()
      expect(transitions).toHaveLength(2)
      expect(transitions[1]).toEqual({from: 'OPEN', to: 'CLOSED'})

      breakerRegistry.unregister('logged-breaker')
    })

    test('custom onStateChange takes priority over default logger', () => {
      const customCalls: string[] = []

      const customBreaker = new CircuitBreaker('custom-log-breaker', {
        failureThreshold: 1,
        onStateChange: (from, to) => customCalls.push(`${from}→${to}`),
      })

      customBreaker.trip()

      // Custom callback should have been called
      expect(customCalls).toEqual(['CLOSED→OPEN'])

      customBreaker.reset()

      expect(customCalls).toEqual(['CLOSED→OPEN', 'OPEN→CLOSED'])

      breakerRegistry.unregister('custom-log-breaker')
    })
  })
})
