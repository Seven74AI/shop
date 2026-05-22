/**
 * Circuit Breaker Reset Endpoint
 *
 * POST /api/admin/circuit-breakers/:name/reset
 *
 * Manually resets a tripped circuit breaker to CLOSED state.
 * Used by the admin monitoring dashboard.
 */

import { data } from 'react-router'
import type { ActionFunctionArgs } from 'react-router'
import { breakerRegistry } from '#app/utils/circuit-breaker-registry.server.ts'

/**
 * POST /api/admin/circuit-breakers/:name/reset
 * Resets the named circuit breaker to CLOSED.
 */
export async function action({ params }: ActionFunctionArgs) {
	const name = params.name
	if (!name) {
		return data(
			{ error: 'Circuit breaker name is required' },
			{ status: 400 },
		)
	}

	const breaker = breakerRegistry.get(name)
	if (!breaker) {
		return data(
			{ error: `Circuit breaker "${name}" not found` },
			{ status: 404 },
		)
	}

	breaker.reset()

	const stats = breaker.getStats()

	return data({
		success: true,
		message: `Circuit breaker "${name}" has been reset to CLOSED.`,
		breaker: {
			name,
			state: stats.state,
			failureCount: stats.failureCount,
			lastFailureTime: stats.lastFailureTime,
			openedAt: stats.openedAt,
		},
	})
}
