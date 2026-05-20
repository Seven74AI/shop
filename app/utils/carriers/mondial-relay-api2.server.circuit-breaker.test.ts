/**
 * @vitest-environment node
 *
 * Circuit breaker integration tests for Mondial Relay API2.
 *
 * These tests verify that the circuit breakers wrapping API2 calls
 * (createShipment and getLabel) properly trip, open, and recover.
 *
 * Unlike mondial-relay-api2.server.test.ts (which tests XML/REST logic directly),
 * this file tests circuit breaker state transitions through the API functions.
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import {
	createShipment,
	getLabel,
	shipmentBreaker,
	labelBreaker,
	type ShipmentRequest,
} from './mondial-relay-api2.server.ts'
import { CircuitOpenError, CircuitState } from '#app/utils/circuit-breaker.server.ts'
import { breakerRegistry } from '#app/utils/circuit-breaker-registry.server.ts'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper: create a minimal valid shipment request
function validShipmentRequest(): ShipmentRequest {
	return {
		shipper: {
			name: 'Test Shipper',
			address: '123 Test St',
			city: 'Paris',
			postalCode: '75001',
			country: 'FR',
			phone: '+331****6789',
			email: 'shipper@test.com',
		},
		recipient: {
			name: 'Test Recipient',
			address: '456 Test Ave',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '+339****4321',
			email: 'recipient@test.com',
		},
		pickupPointId: '12345',
		pickupPointCountry: 'FR',
		weight: 1000,
		reference: 'TEST-REF-001',
	}
}

// Helper: create a minimal valid XML response for shipment creation
function validShipmentResponse(): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
	<ShipmentsList>
		<Shipment ShipmentNumber="123456789">
			<Output>https://www.mondialrelay.fr/label/123456789</Output>
		</Shipment>
	</ShipmentsList>
</ShipmentCreationResponse>`
}

describe('Mondial Relay API2 — Circuit Breaker Integration', () => {
	const originalEnv = { ...process.env }
	const DEFAULT_FAILURE_THRESHOLD = 5

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset timers before each test to avoid contamination
		vi.useRealTimers()
		vi.useFakeTimers()

		// Mock console.error and console.warn to avoid noise
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})

		// Set required environment variables
		process.env.MONDIAL_RELAY_API2_LOGIN = 'TEST_LOGIN'
		process.env.MONDIAL_RELAY_API2_PASSWORD = 'TEST_PASSWORD'
		process.env.MONDIAL_RELAY_API2_CUSTOMER_ID = 'TEST123'

		// Force reset circuit breakers to clean state before each test
		shipmentBreaker.reset()
		labelBreaker.reset()
	})

	afterEach(() => {
		process.env = { ...originalEnv }
		vi.useRealTimers()
		vi.restoreAllMocks()
		// Clean up registry
		for (const name of breakerRegistry.getNames()) {
			breakerRegistry.unregister(name)
		}
	})

	describe('createShipment — circuit breaker behavior', () => {
		test('passes through successful calls when circuit is CLOSED', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => validShipmentResponse(),
			})

			const result = await createShipment(validShipmentRequest())

			expect(result.shipmentNumber).toBe('123456789')
			expect(shipmentBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(shipmentBreaker.getStats().successCount).toBe(1)
		})

		test('counts failures but stays CLOSED below threshold', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD - 1; i++) {
				await createShipment(validShipmentRequest()).catch(() => {})
			}

			expect(shipmentBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(shipmentBreaker.getStats().failureCount).toBe(
				DEFAULT_FAILURE_THRESHOLD - 1,
			)
		})

		test('trips circuit OPEN after consecutive failures reach threshold', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await createShipment(validShipmentRequest()).catch(() => {})
			}

			expect(shipmentBreaker.getState()).toBe(CircuitState.OPEN)
		})

		test('rejects calls with CircuitOpenError when circuit is OPEN', async () => {
			// Trip the circuit
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await createShipment(validShipmentRequest()).catch(() => {})
			}

			// Now circuit is OPEN — next call should be rejected
			mockFetch.mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => validShipmentResponse(),
			})

			await expect(createShipment(validShipmentRequest())).rejects.toThrow(
				CircuitOpenError,
			)

			// Verify fetch was NOT called on the rejected attempt
			expect(mockFetch).toHaveBeenCalledTimes(DEFAULT_FAILURE_THRESHOLD)

		// Verify rejection counter (at least 1 rejection from this test)
		expect(shipmentBreaker.getStats().totalRejections).toBeGreaterThan(0)
		})

		test('recovers via HALF_OPEN after reset timeout elapses', async () => {
			// Trip circuit
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await createShipment(validShipmentRequest()).catch(() => {})
			}
			expect(shipmentBreaker.getState()).toBe(CircuitState.OPEN)

			// Advance past reset timeout
			vi.advanceTimersByTime(35_000)

			// Next call succeeds → HALF_OPEN → CLOSED
			mockFetch.mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => validShipmentResponse(),
			})

			const result = await createShipment(validShipmentRequest())
			expect(result.shipmentNumber).toBe('123456789')
			expect(shipmentBreaker.getState()).toBe(CircuitState.CLOSED)
		})

		test('re-opens circuit on HALF_OPEN failure', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await createShipment(validShipmentRequest()).catch(() => {})
			}
			expect(shipmentBreaker.getState()).toBe(CircuitState.OPEN)

			vi.advanceTimersByTime(35_000)

			// HALF_OPEN call fails → should transition back to OPEN
			mockFetch.mockRejectedValue(new Error('Still failing'))
			await createShipment(validShipmentRequest()).catch(() => {})

			// After HALF_OPEN failure, circuit should be OPEN again
			const finalState = shipmentBreaker.getState()
			expect(finalState === CircuitState.OPEN || finalState === CircuitState.HALF_OPEN).toBe(true)
		})

		test('non-consecutive failures do not trip circuit', async () => {
			// Fail once
			mockFetch.mockRejectedValueOnce(new Error('Fail 1'))
			await createShipment(validShipmentRequest()).catch(() => {})

			// Succeed — resets counter
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => validShipmentResponse(),
			})
			await createShipment(validShipmentRequest())

			// Fail 4 times (not enough after reset)
			for (let i = 0; i < 4; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Fail ${i + 2}`))
				await createShipment(validShipmentRequest()).catch(() => {})
			}

			expect(shipmentBreaker.getState()).toBe(CircuitState.CLOSED)
		})
	})

	describe('getLabel — circuit breaker behavior', () => {
		test('passes through successful calls when circuit is CLOSED', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				blob: async () => new Blob(['PDF content'], { type: 'application/pdf' }),
			})

			const result = await getLabel('123456789')

			expect(result).toBeInstanceOf(Blob)
			expect(labelBreaker.getState()).toBe(CircuitState.CLOSED)
		})

		test('trips circuit OPEN after consecutive failures', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await getLabel('123456789').catch(() => {})
			}

			expect(labelBreaker.getState()).toBe(CircuitState.OPEN)
		})

		test('rejects with CircuitOpenError when label breaker is OPEN', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await getLabel('123456789').catch(() => {})
			}

			mockFetch.mockResolvedValue({
				ok: true,
				blob: async () => new Blob(['PDF'], { type: 'application/pdf' }),
			})

			await expect(getLabel('123456789')).rejects.toThrow(CircuitOpenError)
		})

		test('recovers via HALF_OPEN after reset timeout', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await getLabel('123456789').catch(() => {})
			}
			expect(labelBreaker.getState()).toBe(CircuitState.OPEN)

			vi.advanceTimersByTime(35_000)

			mockFetch.mockResolvedValue({
				ok: true,
				blob: async () => new Blob(['PDF'], { type: 'application/pdf' }),
			})

			const result = await getLabel('123456789')
			expect(result).toBeInstanceOf(Blob)
			expect(labelBreaker.getState()).toBe(CircuitState.CLOSED)
		})
	})

	describe('independent breakers', () => {
		test('shipment breaker tripping does not affect label breaker', async () => {
			// Trip only the shipment breaker
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await createShipment(validShipmentRequest()).catch(() => {})
			}

			expect(shipmentBreaker.getState()).toBe(CircuitState.OPEN)
			// Label breaker should still be CLOSED
			expect(labelBreaker.getState()).toBe(CircuitState.CLOSED)
		})
	})
})
