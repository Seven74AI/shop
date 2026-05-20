/**
 * Mondial Relay Circuit Breaker
 *
 * Shared circuit breaker instances for Mondial Relay API calls.
 * Wraps all calls to Mondial Relay API1 and API2 with resilience:
 * - Opens after 5 consecutive failures
 * - Half-opens after 30 seconds
 * - Reports state transitions to Sentry
 *
 * Usage:
 *   import { api1Breaker, api2Breaker } from './mondial-relay-circuit-breaker.server'
 *   const result = await api1Breaker.execute(() => someApiCall())
 */

import * as Sentry from '@sentry/react-router'
import {
	CircuitState,
	ConsecutiveBreaker,
	Policy,
	type CircuitBreakerPolicy,
} from 'cockatiel'

const CIRCUIT_STATE_NAMES: Record<CircuitState, string> = {
	[CircuitState.Closed]: 'CLOSED',
	[CircuitState.Open]: 'OPEN',
	[CircuitState.HalfOpen]: 'HALF_OPEN',
	[CircuitState.Isolated]: 'ISOLATED',
}

/**
 * Creates a circuit breaker with the standard Mondial Relay configuration:
 * - Opens after 5 consecutive failures
 * - Half-opens after 30 seconds
 * - Reports all state transitions to Sentry
 */
function createMondialRelayBreaker(name: string): CircuitBreakerPolicy {
	const breaker = Policy.handleAll().circuitBreaker({
		halfOpenAfter: 30_000, // 30 seconds
		breaker: new ConsecutiveBreaker(5), // open after 5 consecutive failures
	})

	// Log state transitions to Sentry
	breaker.onStateChange((state: CircuitState) => {
		const stateName = CIRCUIT_STATE_NAMES[state] ?? 'UNKNOWN'
		Sentry.addBreadcrumb({
			category: 'circuit-breaker',
			message: `Mondial Relay ${name}: circuit ${stateName}`,
			level: state === CircuitState.Open ? 'warning' : 'info',
			data: { breaker: name, state: stateName },
		})
	})

	// Log open events specifically with more detail
	breaker.onBreak((reason) => {
		const error =
			reason && typeof reason === 'object' && 'error' in reason
				? (reason as { error: unknown }).error
				: reason

		Sentry.addBreadcrumb({
			category: 'circuit-breaker',
			message: `Mondial Relay ${name}: circuit OPENED`,
			level: 'warning',
			data: {
				breaker: name,
				reason: error instanceof Error ? error.message : String(error ?? 'unknown'),
			},
		})
	})

	// Log reset events
	breaker.onReset(() => {
		Sentry.addBreadcrumb({
			category: 'circuit-breaker',
			message: `Mondial Relay ${name}: circuit CLOSED (reset)`,
			level: 'info',
			data: { breaker: name },
		})
	})

	// Log half-open events
	breaker.onHalfOpen(() => {
		Sentry.addBreadcrumb({
			category: 'circuit-breaker',
			message: `Mondial Relay ${name}: circuit HALF_OPEN (testing)`,
			level: 'info',
			data: { breaker: name },
		})
	})

	return breaker
}

/** Circuit breaker for Mondial Relay API1 (pickup point search + tracking) */
export const api1Breaker = createMondialRelayBreaker('API1')

/** Circuit breaker for Mondial Relay API2 (shipment creation + labels) */
export const api2Breaker = createMondialRelayBreaker('API2')
