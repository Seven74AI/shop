/**
 * @vitest-environment node
 *
 * Tests for the circuit breaker admin monitoring endpoint.
 *
 * GET /api/admin/circuit-breakers returns health summary for all
 * registered circuit breakers in JSON format.
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { CircuitBreaker } from '#app/utils/circuit-breaker.server.ts'
import { breakerRegistry } from '#app/utils/circuit-breaker-registry.server.ts'
import { loader } from './admin.circuit-breakers.ts'

// Create mock loader args
function mockLoaderArgs(): Parameters<typeof loader>[0] {
	return {
		request: new Request('http://localhost/api/admin/circuit-breakers'),
		params: {},
		context: {},
		url: new URL('http://localhost/api/admin/circuit-breakers'),
		pattern: '/api/admin/circuit-breakers',
	}
}

describe('GET /api/admin/circuit-breakers', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
		// Clean up registry
		for (const name of breakerRegistry.getNames()) {
			breakerRegistry.unregister(name)
		}
	})

	test('returns empty health summary when no breakers registered', async () => {
		const result = await loader(mockLoaderArgs())

		const data = (result as { data: unknown }).data
		expect(data).toEqual({
			total: 0,
			closed: 0,
			open: 0,
			halfOpen: 0,
			breakers: [],
		})
	})

	test('returns health summary with CLOSED breakers', async () => {
		new CircuitBreaker('service-a', { onStateChange: undefined })
		new CircuitBreaker('service-b', { onStateChange: undefined })

		const result = await loader(mockLoaderArgs())

		const data = (result as { data: unknown }).data as Record<string, unknown>
		expect(data.total).toBe(2)
		expect(data.closed).toBe(2)
		expect(data.open).toBe(0)
		expect(data.halfOpen).toBe(0)

		const breakers = data.breakers as Array<{ name: string; state: string }>
		expect(breakers).toHaveLength(2)
		expect(breakers[0]!.name).toBe('service-a')
		expect(breakers[0]!.state).toBe('CLOSED')
		expect(breakers[1]!.name).toBe('service-b')
		expect(breakers[1]!.state).toBe('CLOSED')
	})

	test('tracks OPEN breakers correctly', async () => {
		new CircuitBreaker('healthy-service', { onStateChange: undefined })
		const failingBreaker = new CircuitBreaker('failing-service', {
			onStateChange: undefined,
		})
		failingBreaker.trip()

		const result = await loader(mockLoaderArgs())

		const data = (result as { data: unknown }).data as Record<string, unknown>
		expect(data.total).toBe(2)
		expect(data.closed).toBe(1)
		expect(data.open).toBe(1)
		expect(data.halfOpen).toBe(0)
	})

	test('breaker entries include all health fields', async () => {
		new CircuitBreaker('detail-service', {
			onStateChange: undefined,
			failureThreshold: 3,
		})

		const result = await loader(mockLoaderArgs())

		const data = (result as { data: unknown }).data as Record<string, unknown>
		const breakers = data.breakers as Array<Record<string, unknown>>
		expect(breakers).toHaveLength(1)
		const entry = breakers[0]!

		expect(entry.name).toBe('detail-service')
		expect(entry.state).toBe('CLOSED')
		expect(entry.failureCount).toBe(0)
		expect(entry.totalFailures).toBe(0)
		expect(entry.totalSuccesses).toBe(0)
		expect(entry.totalRejections).toBe(0)
		expect(entry.openedAt).toBeNull()
	})

	test('survives multiple consecutive calls', async () => {
		new CircuitBreaker('multi-call-service', { onStateChange: undefined })

		for (let i = 0; i < 5; i++) {
			const result = await loader(mockLoaderArgs())
			const data = (result as { data: unknown }).data as Record<string, unknown>
			expect(data.total).toBe(1)
		}
	})

	test('includes lastEvents in breaker entries', async () => {
		const breaker = new CircuitBreaker('event-api-test', {
			failureThreshold: 1,
			onStateChange: undefined,
		})
		breaker.trip()
		breaker.reset()

		const result = await loader(mockLoaderArgs())

		const data = (result as { data: unknown }).data as Record<string, unknown>
		const breakers = data.breakers as Array<Record<string, unknown>>
		expect(breakers).toHaveLength(1)

		const entry = breakers[0]!
		expect(entry.lastEvents).toBeDefined()
		const events = entry.lastEvents as Array<Record<string, unknown>>
		expect(Array.isArray(events)).toBe(true)
		expect(events.length).toBeGreaterThanOrEqual(2)

		const eventTypes = events.map((e) => e.type)
		expect(eventTypes).toContain('OPEN')
		expect(eventTypes).toContain('CLOSED')
		expect(eventTypes).toContain('RESET')
	})
})
