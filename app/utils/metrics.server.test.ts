import * as Sentry from '@sentry/react-router'
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { prisma } from './db.server.ts'
import {
	getBusinessMetrics,
	recordCheckoutError,
	recordCheckoutInitiated,
	recordOrderCreated,
} from './metrics.server.ts'

// Mock Sentry
vi.mock('@sentry/react-router', () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}))

describe('metrics.server', () => {
	describe('recordOrderCreated', () => {
		test('calls Sentry.captureMessage with order details', () => {
			recordOrderCreated({
				total: 5000,
				subtotal: 4500,
				userId: 'user-1',
				email: 'test@example.com',
			})

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'order.created',
				expect.objectContaining({
					level: 'info',
					tags: expect.objectContaining({
						metric: 'order_created',
						userType: 'authenticated',
					}),
					extra: expect.objectContaining({
						total: 5000,
						subtotal: 4500,
					}),
				}),
			)
		})

		test('tags guest orders correctly', () => {
			recordOrderCreated({
				total: 3000,
				subtotal: 3000,
				userId: null,
				email: 'guest@example.com',
			})

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'order.created',
				expect.objectContaining({
					tags: expect.objectContaining({
						userType: 'guest',
					}),
				}),
			)
		})

		test('does not throw on Sentry failure', () => {
			vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
				throw new Error('Sentry down')
			})

			// Should not throw
			expect(() =>
				recordOrderCreated({
					total: 1000,
					subtotal: 1000,
					userId: null,
					email: 'test@example.com',
				}),
			).not.toThrow()
		})
	})

	describe('recordCheckoutError', () => {
		test('calls Sentry.captureException with structured tags', () => {
			const error = new Error('Stripe API timeout')

			recordCheckoutError('stripe-api', error, {
				message: error.message,
			})

			expect(Sentry.captureException).toHaveBeenCalledWith(
				error,
				expect.objectContaining({
					tags: expect.objectContaining({
						metric: 'checkout_error',
						context: 'stripe-api',
						errorType: 'Error',
					}),
				}),
			)
		})

		test('handles non-Error objects gracefully', () => {
			recordCheckoutError('unknown', 'just a string')

			expect(Sentry.captureException).toHaveBeenCalledWith(
				'just a string',
				expect.objectContaining({
					tags: expect.objectContaining({
						context: 'unknown',
					}),
				}),
			)
		})

		test('does not throw on Sentry failure', () => {
			vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
				throw new Error('Sentry down')
			})

			expect(() =>
				recordCheckoutError('test', new Error('boom')),
			).not.toThrow()
		})
	})

	describe('recordCheckoutInitiated', () => {
		test('calls Sentry.captureMessage with cart ID', () => {
			recordCheckoutInitiated('cart-abc-123')

			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				'checkout.initiated',
				expect.objectContaining({
					level: 'info',
					tags: expect.objectContaining({
						metric: 'checkout_initiated',
					}),
					extra: expect.objectContaining({
						cartId: 'cart-abc-123',
					}),
				}),
			)
		})

		test('does not throw on Sentry failure', () => {
			vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
				throw new Error('Sentry down')
			})

			expect(() => recordCheckoutInitiated('cart-1')).not.toThrow()
		})
	})

	describe('getBusinessMetrics', () => {
		test('returns zeros when no orders exist', async () => {
			const metrics = await getBusinessMetrics()

			expect(metrics.totalOrders).toBe(0)
			expect(metrics.totalGMV).toBe(0)
			expect(metrics.averageOrderValue).toBe(0)
			expect(metrics.recentOrders).toBe(0)
			expect(metrics.recentGMV).toBe(0)
			expect(metrics.ordersLast7Days).toBe(0)
		})

		test('returns all expected status keys even when empty', async () => {
			const metrics = await getBusinessMetrics()

			expect(metrics.ordersByStatus).toHaveProperty('PENDING')
			expect(metrics.ordersByStatus).toHaveProperty('CONFIRMED')
			expect(metrics.ordersByStatus).toHaveProperty('SHIPPED')
			expect(metrics.ordersByStatus).toHaveProperty('DELIVERED')
			expect(metrics.ordersByStatus).toHaveProperty('CANCELLED')
			// All should be 0
			for (const count of Object.values(metrics.ordersByStatus)) {
				expect(count).toBe(0)
			}
		})

		test('returns activeCarts count', async () => {
			const metrics = await getBusinessMetrics()
			expect(typeof metrics.activeCarts).toBe('number')
		})
	})
})
