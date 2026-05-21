/**
 * Circuit Breaker Configuration
 *
 * Reads circuit breaker configuration from environment variables.
 * Supports global defaults and per-breaker overrides.
 *
 * Environment variables:
 *   CIRCUIT_BREAKER_FAILURE_THRESHOLD       → global default (default: 5)
 *   CIRCUIT_BREAKER_RESET_TIMEOUT_MS        → global default (default: 30000)
 *   CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS  → global default (default: 1)
 *
 * Per-breaker overrides (replace <NAME> with breaker name, uppercase, hyphens→underscores):
 *   CIRCUIT_BREAKER_<NAME>_FAILURE_THRESHOLD
 *   CIRCUIT_BREAKER_<NAME>_RESET_TIMEOUT_MS
 *   CIRCUIT_BREAKER_<NAME>_HALF_OPEN_MAX_REQUESTS
 */

import type { CircuitBreakerConfig } from './circuit-breaker.server.ts'

const DEFAULT_FAILURE_THRESHOLD = 5
const DEFAULT_RESET_TIMEOUT_MS = 30_000
const DEFAULT_HALF_OPEN_MAX_REQUESTS = 1

/**
 * Normalize a breaker name for env var lookup.
 * Replaces non-alphanumeric characters with underscores and uppercases.
 */
function normalizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
}

/**
 * Read a numeric env var, returning the default if unset or invalid.
 */
function readEnvInt(name: string, defaultVal: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultVal
  const parsed = Number(raw)
  if (Number.isNaN(parsed) || parsed < 0) {
    console.warn(
      `Invalid ${name}=${raw}, expected non-negative integer. Using default ${defaultVal}.`,
    )
    return defaultVal
  }
  return parsed
}

/**
 * Get global circuit breaker defaults from environment.
 */
function getGlobalDefaults(): {
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenMaxRequests: number
} {
  return {
    failureThreshold: readEnvInt(
      'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      DEFAULT_FAILURE_THRESHOLD,
    ),
    resetTimeoutMs: readEnvInt(
      'CIRCUIT_BREAKER_RESET_TIMEOUT_MS',
      DEFAULT_RESET_TIMEOUT_MS,
    ),
    halfOpenMaxRequests: readEnvInt(
      'CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS',
      DEFAULT_HALF_OPEN_MAX_REQUESTS,
    ),
  }
}

/**
 * Get circuit breaker configuration for a named breaker.
 *
 * Reads global defaults from env, then applies per-breaker overrides.
 * The `overrides` parameter provides hardcoded defaults that can still
 * be overridden by env vars.
 *
 * Priority: per-breaker env var > global env var > hardcoded override > built-in default
 */
export function getCircuitBreakerConfig(
  name: string,
  overrides: CircuitBreakerConfig = {},
): CircuitBreakerConfig {
  const globals = getGlobalDefaults()
  const normalized = normalizeName(name)

  return {
    failureThreshold:
      readEnvInt(
        `CIRCUIT_BREAKER_${normalized}_FAILURE_THRESHOLD`,
        overrides.failureThreshold ?? globals.failureThreshold,
      ),
    resetTimeoutMs:
      readEnvInt(
        `CIRCUIT_BREAKER_${normalized}_RESET_TIMEOUT_MS`,
        overrides.resetTimeoutMs ?? globals.resetTimeoutMs,
      ),
    halfOpenMaxRequests:
      readEnvInt(
        `CIRCUIT_BREAKER_${normalized}_HALF_OPEN_MAX_REQUESTS`,
        overrides.halfOpenMaxRequests ?? globals.halfOpenMaxRequests,
      ),
    onStateChange: overrides.onStateChange,
  }
}

/**
 * Get all global circuit breaker defaults (exposed for monitoring).
 */
export { getGlobalDefaults }
