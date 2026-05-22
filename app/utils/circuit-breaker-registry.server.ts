/**
 * Circuit Breaker Registry
 *
 * Central registry for all circuit breakers in the application.
 * Enables monitoring of circuit breaker status across all services.
 *
 * Used by the admin monitoring endpoint and health checks.
 */

import type {
  CircuitBreaker,
  CircuitBreakerStats,
  CircuitBreakerEvent,
} from './circuit-breaker.server.ts'

/**
 * Registry that tracks all circuit breaker instances.
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker<unknown[], unknown>>()

  /**
   * Register a circuit breaker instance.
   * Called automatically by CircuitBreaker constructor.
   */
  register(breaker: CircuitBreaker<unknown[], unknown>): void {
    if (this.breakers.has(breaker.name)) {
      // Replace existing breaker with same name (hot-reload compatible)
      console.debug(
        `Circuit breaker "${breaker.name}" re-registered (replaced previous instance).`,
      )
    }
    this.breakers.set(breaker.name, breaker)
  }

  /**
   * Unregister a circuit breaker instance.
   */
  unregister(name: string): void {
    this.breakers.delete(name)
  }

  /**
   * Get a single circuit breaker by name.
   */
  get(name: string): CircuitBreaker<unknown[], unknown> | undefined {
    return this.breakers.get(name)
  }

  /**
   * Get stats for all registered circuit breakers.
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>()
    for (const [name, breaker] of this.breakers) {
      stats.set(name, breaker.getStats())
    }
    return stats
  }

  /**
   * Get stats for a single circuit breaker.
   */
  getStats(name: string): CircuitBreakerStats | undefined {
    const breaker = this.breakers.get(name)
    return breaker?.getStats()
  }

  /**
   * Get all circuit breaker names.
   */
  getNames(): string[] {
    return Array.from(this.breakers.keys())
  }

  /**
   * Get the number of registered breakers.
   */
  get count(): number {
    return this.breakers.size
  }

  /**
   * Reset all circuit breakers (force CLOSED state).
   * Use with caution — only for admin recovery.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
  }

  /**
   * Trip all circuit breakers (force OPEN state).
   * Use with caution — only for admin intervention/testing.
   */
  tripAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.trip()
    }
  }
}

/**
 * Singleton registry instance.
 * All circuit breakers register here automatically.
 */
export const breakerRegistry = new CircuitBreakerRegistry()

/**
 * Get a summary of all circuit breaker states suitable for health checks.
 *
 * Returns structured data for monitoring dashboards and alerting systems.
 */
export function getCircuitBreakerHealthSummary(): {
  total: number
  open: number
  halfOpen: number
  closed: number
  breakers: Array<{
    name: string
    state: string
    failureCount: number
    totalFailures: number
    totalSuccesses: number
    totalRejections: number
    openedAt: number | null
    lastFailureTime: number | null
    lastSuccessTime: number | null
    lastEvents: CircuitBreakerEvent[]
  }>
} {
  const stats = breakerRegistry.getAllStats()
  const breakers: Array<{
    name: string
    state: string
    failureCount: number
    totalFailures: number
    totalSuccesses: number
    totalRejections: number
    openedAt: number | null
    lastFailureTime: number | null
    lastSuccessTime: number | null
    lastEvents: CircuitBreakerEvent[]
  }> = []

  let open = 0
  let halfOpen = 0
  let closed = 0

  for (const [name, s] of stats) {
    breakers.push({
      name,
      state: s.state,
      failureCount: s.failureCount,
      totalFailures: s.totalFailures,
      totalSuccesses: s.totalSuccesses,
      totalRejections: s.totalRejections,
      openedAt: s.openedAt,
      lastFailureTime: s.lastFailureTime,
      lastSuccessTime: s.lastSuccessTime,
      lastEvents: s.lastEvents,
    })

    if (s.state === 'OPEN') open++
    else if (s.state === 'HALF_OPEN') halfOpen++
    else closed++
  }

  return { total: stats.size, open, halfOpen, closed, breakers }
}
