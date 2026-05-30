import { prisma } from './db.server.ts'

// ─── Types ───────────────────────────────────────────────────────────────

export interface ReviewAggregate {
	/** Average rating (null if no approved reviews) */
	averageRating: number | null
	/** Count of reviews per star rating (index 0 = 1 star, index 4 = 5 stars) */
	distribution: [number, number, number, number, number]
	/** Total number of approved reviews */
	totalCount: number
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Compute aggregate review stats for a single product.
 * Only counts approved reviews (isApproved = true).
 */
export async function getProductReviewAggregate(
	productId: string,
): Promise<ReviewAggregate> {
	const rows = await prisma.$queryRawUnsafe<
		Array<{ rating: number; cnt: number }>
	>(
		`SELECT rating, COUNT(*) as cnt
		 FROM Review
		 WHERE productId = ? AND isApproved = 1
		 GROUP BY rating
		 ORDER BY rating`,
		productId,
	)

	return buildAggregate(rows)
}

/**
 * Compute aggregate review stats for multiple products in a single query.
 * Returns a Map of productId → ReviewAggregate.
 * Only counts approved reviews (isApproved = true).
 */
export async function getProductReviewAggregates(
	productIds: string[],
): Promise<Map<string, ReviewAggregate>> {
	if (productIds.length === 0) return new Map()

	// Build placeholder list for IN clause
	const placeholders = productIds.map(() => '?').join(', ')

	const rows = await prisma.$queryRawUnsafe<
		Array<{ productId: string; rating: number; cnt: number }>
	>(
		`SELECT productId, rating, COUNT(*) as cnt
		 FROM Review
		 WHERE productId IN (${placeholders}) AND isApproved = 1
		 GROUP BY productId, rating
		 ORDER BY productId, rating`,
		...productIds,
	)

	// Group by productId
	const map = new Map<string, Array<{ rating: number; cnt: number }>>()
	for (const row of rows) {
		const existing = map.get(row.productId) ?? []
		existing.push({ rating: Number(row.rating), cnt: Number(row.cnt) })
		map.set(row.productId, existing)
	}

	const result = new Map<string, ReviewAggregate>()
	for (const productId of productIds) {
		result.set(productId, buildAggregate(map.get(productId) ?? []))
	}

	return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildAggregate(
	rows: Array<{ rating: number; cnt: number }>,
): ReviewAggregate {
	const distribution: [number, number, number, number, number] = [
		0, 0, 0, 0, 0,
	]
	let totalRating = 0
	let totalCount = 0

	for (const row of rows) {
		const rating = Number(row.rating)
		const cnt = Number(row.cnt)
		if (rating >= 1 && rating <= 5) {
			distribution[rating - 1] = cnt
			totalRating += rating * cnt
			totalCount += cnt
		}
	}

	return {
		averageRating: totalCount > 0 ? totalRating / totalCount : null,
		distribution,
		totalCount,
	}
}
