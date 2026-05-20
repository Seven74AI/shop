import { type Prisma, type OrderStatus } from '@prisma/client'
import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'

/**
 * Business metrics module.
 *
 * Tracks key business events: orders created, GMV, checkout errors,
 * and conversion funnel data. Uses the database for aggregate queries
 * and Sentry for error-level metrics.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface OrderMetrics {
	total: number // Total in cents
	subtotal: number // Subtotal in cents
	userId: string | null
	email: string
}

export interface BusinessMetrics {
	/** Total orders ever created */
	totalOrders: number
	/** Total GMV (sum of all order totals) in cents */
	totalGMV: number
	/** Average order value in cents */
	averageOrderValue: number
	/** Orders grouped by status */
	ordersByStatus: Record<OrderStatus, number>
	/** Orders created in the last 30 days */
	recentOrders: number
	/** GMV in the last 30 days */
	recentGMV: number
	/** Current active carts (proxy for conversion funnel top) */
	activeCarts: number
	/** Orders in last 7 days for conversion rate calculation */
	ordersLast7Days: number
}

// ─── Recording (fire-and-forget) ──────────────────────────────────

/**
 * Record an order creation event.
 * Sends a structured metric to Sentry with order value for GMV tracking.
 * Non-blocking — failures are silently captured by Sentry.
 */
export function recordOrderCreated(order: OrderMetrics): void {
	try {
		Sentry.captureMessage('order.created', {
			level: 'info',
			tags: {
				metric: 'order_created',
				userType: order.userId ? 'authenticated' : 'guest',
			},
			extra: {
				total: order.total,
				subtotal: order.subtotal,
			},
		})
	} catch {
		// Silently ignore — metrics should never break business logic
	}
}

/**
 * Record a checkout error event.
 * Tags the error with structured metadata for filtering in Sentry dashboards.
 * Non-blocking — failures are silently captured by Sentry.
 */
export function recordCheckoutError(
	context: string,
	error: unknown,
	extra?: Record<string, unknown>,
): void {
	try {
		const message =
			error instanceof Error ? error.message : 'Unknown checkout error'

		Sentry.captureException(error, {
			tags: {
				metric: 'checkout_error',
				context,
				errorType: error instanceof Error ? error.constructor.name : typeof error,
			},
			extra: {
				...extra,
				message,
			},
		})
	} catch {
		// Silently ignore
	}
}

/**
 * Record a conversion event (cart progressed to checkout).
 * Tracks the conversion funnel: cart -> payment initiation.
 */
export function recordCheckoutInitiated(cartId: string): void {
	try {
		Sentry.captureMessage('checkout.initiated', {
			level: 'info',
			tags: {
				metric: 'checkout_initiated',
			},
			extra: {
				cartId,
			},
		})
	} catch {
		// Silently ignore
	}
}

// ─── Querying (for admin dashboard) ───────────────────────────────

/**
 * Get business metrics from the database.
 * Aggregates order data for the admin metrics dashboard.
 */
export async function getBusinessMetrics(): Promise<BusinessMetrics> {
	const thirtyDaysAgo = new Date()
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

	const sevenDaysAgo = new Date()
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

	const [totalAgg, recentAgg, statusBreakdown, activeCarts, recentOrderCount] =
		await Promise.all([
			// Total orders + GMV (all time)
			prisma.order.aggregate({
				_sum: { total: true },
				_count: { id: true },
			}),
		// Last 30 days
		prisma.order.aggregate({
			where: { createdAt: { gte: thirtyDaysAgo } },
			_sum: { total: true },
			_count: { id: true },
		}),
			// Group by status
			prisma.order.groupBy({
				by: ['status'],
				_count: { status: true },
			}),
			// Active carts
			prisma.cart.count(),
			// Orders last 7 days (for conversion displays)
			prisma.order.count({
				where: { createdAt: { gte: sevenDaysAgo } },
			}),
		])

	const totalOrders = totalAgg._count.id
	const totalGMV = totalAgg._sum.total ?? 0
	const recentOrders = recentAgg._count.id ?? 0
	const recentGMV = recentAgg._sum.total ?? 0

	const ordersByStatus = {} as Record<OrderStatus, number>
	for (const row of statusBreakdown) {
		ordersByStatus[row.status] = row._count.status
	}
	// Ensure all statuses are present
	for (const status of [
		'PENDING',
		'CONFIRMED',
		'SHIPPED',
		'DELIVERED',
		'CANCELLED',
	] as OrderStatus[]) {
		if (!(status in ordersByStatus)) {
			ordersByStatus[status] = 0
		}
	}

	return {
		totalOrders,
		totalGMV,
		averageOrderValue: totalOrders > 0 ? Math.round(totalGMV / totalOrders) : 0,
		ordersByStatus,
		recentOrders,
		recentGMV,
		activeCarts,
		ordersLast7Days: recentOrderCount,
	}
}
