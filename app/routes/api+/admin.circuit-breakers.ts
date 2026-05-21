/**
 * Circuit Breaker Monitoring Endpoint
 *
 * GET /api/admin/circuit-breakers
 *
 * Returns the status of all circuit breakers in JSON format.
 * Used for monitoring, dashboards, and health checks.
 */

import { data } from 'react-router'
import type { LoaderFunctionArgs } from 'react-router'
import { getCircuitBreakerHealthSummary } from '#app/utils/circuit-breaker-registry.server.ts'

/**
 * GET /api/admin/circuit-breakers
 * Returns circuit breaker status for all registered breakers.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const summary = getCircuitBreakerHealthSummary()

  return data(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json',
    },
  })
}
