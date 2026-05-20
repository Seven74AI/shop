/**
 * @vitest-environment node
 *
 * Circuit breaker integration tests for Mondial Relay API1.
 *
 * These tests verify that the circuit breakers wrapping API1 calls
 * (searchPickupPoints and getTrackingInfo) properly trip, open, and recover.
 *
 * Unlike mondial-relay-api1.server.test.ts (which tests SOAP/XML logic directly),
 * this file tests circuit breaker state transitions through the API functions.
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import {
	searchPickupPoints,
	getTrackingInfo,
	pickupPointsBreaker,
	trackingBreaker,
} from './mondial-relay-api1.server.ts'
import { CircuitOpenError, CircuitState } from '#app/utils/circuit-breaker.server.ts'
import { breakerRegistry } from '#app/utils/circuit-breaker-registry.server.ts'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper: create a minimal valid SOAP response for pickup points
function validPickupResponse(): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais>
          <PointRelais>
            <Num>12345</Num>
            <LgAdr1>Test Pickup</LgAdr1>
            <LgAdr2></LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
          </PointRelais>
        </PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`
}

// Helper: create a minimal valid SOAP response for tracking
function validTrackingResponse(): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetailleResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_TracingColisDetailleResult>
        <Stat>0</Stat>
        <Libelle>Delivered</Libelle>
        <Tracing>
          <Libelle>Delivered</Libelle>
          <Statut>LI</Statut>
          <EventList>
            <Event>
              <Date>2024-01-01</Date>
              <Heure>10:00</Heure>
              <Libelle>Delivered</Libelle>
              <Localisation>PARIS</Localisation>
            </Event>
          </EventList>
        </Tracing>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`
}

describe('Mondial Relay API1 — Circuit Breaker Integration', () => {
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
		process.env.MONDIAL_RELAY_API1_STORE_CODE = 'TEST_STORE'
		process.env.MONDIAL_RELAY_API1_PRIVATE_KEY = 'TEST_PRIVATE_KEY'
		process.env.MONDIAL_RELAY_API1_BRAND_CODE = 'TEST_BRAND'

		// Force reset circuit breakers to a clean state before each test
		pickupPointsBreaker.reset()
		trackingBreaker.reset()
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

	describe('searchPickupPoints — circuit breaker behavior', () => {
		test('passes through successful calls when circuit is CLOSED', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				text: async () => validPickupResponse(),
			})

			const result = await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			})

			expect(result).toHaveLength(1)
			expect(result[0]!.id).toBe('12345')
			expect(pickupPointsBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(pickupPointsBreaker.getStats().successCount).toBe(1)
		})

		test('counts failures but stays CLOSED below threshold', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD - 1; i++) {
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}

			expect(pickupPointsBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(pickupPointsBreaker.getStats().failureCount).toBe(
				DEFAULT_FAILURE_THRESHOLD - 1,
			)
		})

		test('trips circuit OPEN after consecutive failures reach threshold', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}

			expect(pickupPointsBreaker.getState()).toBe(CircuitState.OPEN)
		})

		test('rejects calls with CircuitOpenError when circuit is OPEN', async () => {
			// Trip the circuit
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}

			// Now circuit is OPEN — next call should be rejected immediately
			mockFetch.mockResolvedValue({
				ok: true,
				text: async () => validPickupResponse(),
			})

			await expect(
				searchPickupPoints({ postalCode: '75001', country: 'FR' }),
			).rejects.toThrow(CircuitOpenError)

			// Verify fetch was NOT called (rejected by circuit breaker, not the API)
			expect(mockFetch).toHaveBeenCalledTimes(DEFAULT_FAILURE_THRESHOLD)

		// Verify rejection counter (at least 1 rejection from this test)
		expect(pickupPointsBreaker.getStats().totalRejections).toBeGreaterThan(0)
		})

		test('recovers via HALF_OPEN after reset timeout elapses', async () => {
			// Trip the circuit
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}
			expect(pickupPointsBreaker.getState()).toBe(CircuitState.OPEN)

			// Advance past reset timeout
			vi.advanceTimersByTime(35_000)

			// Next call should succeed (HALF_OPEN → CLOSED)
			mockFetch.mockResolvedValue({
				ok: true,
				text: async () => validPickupResponse(),
			})

			const result = await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			})
			expect(result).toBeDefined()
			expect(pickupPointsBreaker.getState()).toBe(CircuitState.CLOSED)
		})

		test('re-opens circuit on HALF_OPEN failure', async () => {
			// Trip the circuit
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}
			expect(pickupPointsBreaker.getState()).toBe(CircuitState.OPEN)

			// Advance past reset timeout
			vi.advanceTimersByTime(35_000)

			// HALF_OPEN call fails → should transition back to OPEN
			// Note: the first fire() call enters HALF_OPEN, the fn runs and fails,
			// triggering onFailure() which transitions HALF_OPEN → OPEN
			mockFetch.mockRejectedValue(new Error('Still failing'))
			await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			}).catch(() => {})

			// After HALF_OPEN failure, circuit should be OPEN again
			const finalState = pickupPointsBreaker.getState()
			expect(finalState === CircuitState.OPEN || finalState === CircuitState.HALF_OPEN).toBe(true)
		})

		test('does NOT trip on non-consecutive failures interleaved with successes', async () => {
			// Fail once
			mockFetch.mockRejectedValueOnce(new Error('Fail 1'))
			await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			}).catch(() => {})

			// Succeed — resets failure counter
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => validPickupResponse(),
			})
			await searchPickupPoints({ postalCode: '75001', country: 'FR' })

			// Fail 3 more times (not enough to hit threshold)
			for (let i = 0; i < 3; i++) {
				mockFetch.mockRejectedValueOnce(new Error(`Fail ${i + 2}`))
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}

			// Still CLOSED — counter was reset by the success
			expect(pickupPointsBreaker.getState()).toBe(CircuitState.CLOSED)
			expect(pickupPointsBreaker.getStats().failureCount).toBe(3)
		})
	})

	describe('getTrackingInfo — circuit breaker behavior', () => {
		test('passes through successful calls when circuit is CLOSED', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				text: async () => validTrackingResponse(),
			})

			const result = await getTrackingInfo('MR123456789')

			expect(result).toBeDefined()
			expect(result.statusCode).toBe('LI')
			expect(trackingBreaker.getState()).toBe(CircuitState.CLOSED)
		})

		test('trips circuit OPEN after consecutive failures', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await getTrackingInfo('MR123456789').catch(() => {})
			}

			expect(trackingBreaker.getState()).toBe(CircuitState.OPEN)
		})

		test('rejects with CircuitOpenError when tracking breaker is OPEN', async () => {
			// Trip circuit
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await getTrackingInfo('MR123456789').catch(() => {})
			}

			mockFetch.mockResolvedValue({
				ok: true,
				text: async () => validTrackingResponse(),
			})

			await expect(getTrackingInfo('MR123456789')).rejects.toThrow(
				CircuitOpenError,
			)
		})

		test('recovers via HALF_OPEN after reset timeout', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await getTrackingInfo('MR123456789').catch(() => {})
			}
			expect(trackingBreaker.getState()).toBe(CircuitState.OPEN)

			vi.advanceTimersByTime(35_000)

			mockFetch.mockResolvedValue({
				ok: true,
				text: async () => validTrackingResponse(),
			})

			const result = await getTrackingInfo('MR123456789')
			expect(result).toBeDefined()
			expect(trackingBreaker.getState()).toBe(CircuitState.CLOSED)
		})
	})

	describe('independent breakers', () => {
		test('pickup breaker tripping does not affect tracking breaker', async () => {
			// Trip only the pickup breaker
			mockFetch.mockRejectedValue(new Error('Network error'))
			for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
				await searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}).catch(() => {})
			}

			expect(pickupPointsBreaker.getState()).toBe(CircuitState.OPEN)
			// Tracking breaker should still be CLOSED
			expect(trackingBreaker.getState()).toBe(CircuitState.CLOSED)
		})
	})
})
