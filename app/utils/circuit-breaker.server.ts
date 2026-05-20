/**
 * Circuit Breaker
 *
 * Implements the Circuit Breaker pattern to protect external service calls.
 * Prevents cascading failures by tripping when a threshold of failures is reached.
 *
 * State machine:
 *   CLOSED → (failures >= threshold) → OPEN
 *   OPEN → (resetTimeout elapsed) → HALF_OPEN
 *   HALF_OPEN → (success) → CLOSED
 *   HALF_OPEN → (failure) → OPEN
 *
 * Used by Mondial Relay API clients to handle transient failures gracefully.
 */

import { breakerRegistry } from './circuit-breaker-registry.server.ts'

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number
  /** Milliseconds to wait before moving from OPEN to HALF_OPEN */
  resetTimeoutMs?: number
  /** Maximum concurrent requests allowed in HALF_OPEN state */
  halfOpenMaxRequests?: number
  /** Called when the circuit transitions state */
  onStateChange?: (from: CircuitState, to: CircuitState) => void
}

export interface CircuitBreakerStats {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  openedAt: number | null
  totalFailures: number
  totalSuccesses: number
  totalRejections: number
}

const DEFAULT_FAILURE_THRESHOLD = 5
const DEFAULT_RESET_TIMEOUT_MS = 30_000 // 30 seconds
const DEFAULT_HALF_OPEN_MAX_REQUESTS = 1

/**
 * Creates a default state change logger that captures the breaker name.
 * Logs circuit breaker state transitions at WARN level for observability.
 */
function createDefaultStateChangeLogger(
  name: string,
): (from: CircuitState, to: CircuitState) => void {
  return (from: CircuitState, to: CircuitState) => {
    console.warn(
      `Circuit breaker "${name}" state change: ${from} → ${to}`,
    )
  }
}

/**
 * A circuit breaker for async function calls.
 *
 * Wraps an async function and prevents calls when the circuit is OPEN
 * (too many recent failures). After a cooldown, the circuit enters
 * HALF_OPEN and allows a limited number of trial requests.
 */
export class CircuitBreaker<_Args extends unknown[], Result> {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private openedAt: number | null = null
  private totalFailures = 0
  private totalSuccesses = 0
  private totalRejections = 0
  private halfOpenInFlight = 0

  public readonly name: string
  private readonly failureThreshold: number
  private readonly resetTimeoutMs: number
  private readonly halfOpenMaxRequests: number
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void

  constructor(name: string, config: CircuitBreakerConfig = {}) {
    this.name = name
    this.failureThreshold =
      config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
    this.resetTimeoutMs = config.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS
    this.halfOpenMaxRequests =
      config.halfOpenMaxRequests ?? DEFAULT_HALF_OPEN_MAX_REQUESTS
    this.onStateChange =
      config.onStateChange ?? createDefaultStateChangeLogger(name)
    // Auto-register with central registry for monitoring
    breakerRegistry.register(
      this as unknown as CircuitBreaker<unknown[], unknown>,
    )
  }

  /**
   * Execute the given async function through the circuit breaker.
   *
   * If the circuit is OPEN, throws immediately without calling the function.
   * If HALF_OPEN, allows at most halfOpenMaxRequests concurrent calls.
   * Failures increment the failure counter; successes reset it.
   */
  async fire(fn: () => Promise<Result>): Promise<Result> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN)
      } else {
        this.totalRejections++
        throw new CircuitOpenError(this.name, this.openedAt!)
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenInFlight >= this.halfOpenMaxRequests) {
        this.totalRejections++
        throw new CircuitOpenError(this.name, this.openedAt!)
      }
      this.halfOpenInFlight++
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    } finally {
      if (this.state === CircuitState.HALF_OPEN) {
        this.halfOpenInFlight--
      }
    }
  }

  /**
   * Force the circuit to OPEN state (manual trip).
   */
  trip(): void {
    if (this.state !== CircuitState.OPEN) {
      this.transitionTo(CircuitState.OPEN)
    }
  }

  /**
   * Force the circuit to CLOSED state (manual reset).
   */
  reset(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.failureCount = 0
      this.halfOpenInFlight = 0
      this.transitionTo(CircuitState.CLOSED)
    }
  }

  /**
   * Get current circuit breaker statistics.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalRejections: this.totalRejections,
    }
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state
  }

  private onSuccess(): void {
    this.totalSuccesses++
    this.lastSuccessTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // Success in HALF_OPEN → close the circuit
      this.failureCount = 0
      this.transitionTo(CircuitState.CLOSED)
    } else {
      // Success in CLOSED → reset failure count
      this.failureCount = 0
      this.successCount++
    }
  }

  private onFailure(): void {
    this.totalFailures++
    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in HALF_OPEN → re-open the circuit
      this.failureCount++
      this.transitionTo(CircuitState.OPEN)
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount++
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN)
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.openedAt) return false
    return Date.now() - this.openedAt >= this.resetTimeoutMs
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state
    if (oldState === newState) return

    this.state = newState

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now()
    } else if (newState === CircuitState.HALF_OPEN) {
      this.openedAt = null
    } else if (newState === CircuitState.CLOSED) {
      this.openedAt = null
      this.failureCount = 0
    }

    if (this.onStateChange) {
      try {
        this.onStateChange(oldState, newState)
      } catch {
        // Don't let state change callback errors affect the circuit
      }
    }
  }
}

/**
 * Error thrown when a circuit is OPEN and a call is rejected.
 */
export class CircuitOpenError extends Error {
  public readonly circuitName: string
  public readonly openedAt: number

  constructor(circuitName: string, openedAt: number) {
    const openedDate = new Date(openedAt).toISOString()
    super(
      `Circuit breaker "${circuitName}" is OPEN (opened at ${openedDate}). Call rejected.`,
    )
    this.name = 'CircuitOpenError'
    this.circuitName = circuitName
    this.openedAt = openedAt
  }
}

/**
 * Convenience function to wrap an async function with a circuit breaker.
 *
 * Usage:
 * ```ts
 * const breaker = new CircuitBreaker('my-service')
 * const result = await breaker.fire(() => myAsyncCall(args))
 * ```
 */
