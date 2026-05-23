import { prisma } from './db.server.ts'

export type TimeRange = '7d' | '30d' | '90d'

/**
 * Returns a Date representing the start of the given time range.
 * E.g. range='7d' returns a Date 7 days ago from now.
 */
function getDateFromRange(range: TimeRange): Date {
	const now = new Date()
	const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

/**
 * Gross Merchandise Value — sum of order totals excluding cancelled orders
 * within the given time range.
 */
export async function getGMV(range: TimeRange): Promise<number> {
	const since = getDateFromRange(range)
	const result = await prisma.order.aggregate({
		_sum: { total: true },
		where: {
			status: { not: 'CANCELLED' },
			createdAt: { gte: since },
		},
	})
	return result._sum.total ?? 0
}

/**
 * Total order count within the given time range (all statuses).
 */
export async function getOrdersCount(range: TimeRange): Promise<number> {
	const since = getDateFromRange(range)
	return prisma.order.count({
		where: { createdAt: { gte: since } },
	})
}

/**
 * Revenue — same as GMV for now (can be extended to subtract refunds).
 */
export async function getRevenue(range: TimeRange): Promise<number> {
	return getGMV(range)
}

/**
 * Conversion rate = completed orders / total orders × 100 (percentage).
 * "Completed" means not CANCELLED and not PENDING.
 * Returns a number like 85.5 meaning 85.5%.
 */
export async function getConversionRate(range: TimeRange): Promise<number> {
	const since = getDateFromRange(range)
	const [total, completed] = await Promise.all([
		prisma.order.count({ where: { createdAt: { gte: since } } }),
		prisma.order.count({
			where: {
				status: { notIn: ['CANCELLED', 'PENDING'] },
				createdAt: { gte: since },
			},
		}),
	])
	if (total === 0) return 0
	return Math.round((completed / total) * 10000) / 100
}

/**
 * Top N products by quantity sold within the given time range.
 * Excludes cancelled orders.
 */
export async function getTopProducts(
	range: TimeRange,
	limit = 5,
): Promise<
	Array<{
		product: { id: string; name: string; slug: string; price: number } | null
		quantity: number
		revenue: number
	}>
> {
	const since = getDateFromRange(range)

	// Aggregate order items grouped by product, filtering on the parent order
	const aggregated = await prisma.orderItem.groupBy({
		by: ['productId'],
		_sum: { quantity: true, price: true },
		where: {
			order: {
				status: { not: 'CANCELLED' },
				createdAt: { gte: since },
			},
		},
		orderBy: { _sum: { quantity: 'desc' } },
		take: limit,
	})

	// Fetch product details for the aggregated results
	const productIds = aggregated.map((a) => a.productId)
	const products = await prisma.product.findMany({
		where: { id: { in: productIds } },
		select: { id: true, name: true, slug: true, price: true },
	})

	// Compute accurate revenue = SUM(quantity * price) per product
	// (Prisma groupBy cannot do computed aggregations)
	const revenueRows = productIds.length > 0
		? await prisma.$queryRawUnsafe<
				Array<{ productId: string; revenue: number }>
			>(
				`SELECT "productId", SUM("quantity" * "price") as "revenue"
				 FROM "OrderItem"
				 WHERE "orderId" IN (
					 SELECT "id" FROM "Order" WHERE "status" != 'CANCELLED' AND "createdAt" >= ?
				 )
				 AND "productId" IN (${productIds.map(() => '?').join(',')})
				 GROUP BY "productId"`,
				since,
				...productIds,
			)
		: []

	return aggregated.map((a) => {
		const product = products.find((p) => p.id === a.productId) ?? null
		const quantity = a._sum.quantity ?? 0
		const revRow = revenueRows.find((r) => r.productId === a.productId)
		return {
			product,
			quantity,
			revenue: revRow ? Number(revRow.revenue) : 0,
		}
	})
}

/**
 * Error count — placeholder. Returns 0 until error logging instrumentation
 * is added to the codebase.
 */
export async function getErrorCount(_range: TimeRange): Promise<number> {
	// TODO: Implement when error logging infrastructure is added
	return 0
}

/**
 * Snapshot of all business metrics for a given time range.
 * Single call returns everything for the dashboard.
 */
export async function getMetricsSnapshot(range: TimeRange) {
	const [gmv, ordersCount, revenue, conversionRate, topProducts, errorCount] =
		await Promise.all([
			getGMV(range),
			getOrdersCount(range),
			getRevenue(range),
			getConversionRate(range),
			getTopProducts(range),
			getErrorCount(range),
		])

	return {
		gmv,
		ordersCount,
		revenue,
		conversionRate,
		topProducts,
		errorCount,
	}
}
