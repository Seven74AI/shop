import { invariant } from '@epic-web/invariant'
import { prisma } from './db.server.ts'

/**
 * Check if a user has purchased a product (has at least one confirmed/shipped/delivered order containing it).
 */
export async function hasUserPurchasedProduct(
	userId: string,
	productId: string,
): Promise<{ purchased: boolean; orderId?: string }> {
	const orderItem = await prisma.orderItem.findFirst({
		where: {
			productId,
			order: {
				userId,
				status: { in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] },
			},
		},
		select: { orderId: true },
		orderBy: { createdAt: 'desc' },
	})
	return {
		purchased: !!orderItem,
		orderId: orderItem?.orderId,
	}
}

/**
 * Create a review for a product. Validates that the user hasn't already reviewed
 * this product, and marks the review as verified if the user purchased it.
 */
export async function createReview({
	userId,
	productId,
	rating,
	title,
	body,
}: {
	userId: string
	productId: string
	rating: number
	title?: string
	body: string
}) {
	invariant(rating >= 1 && rating <= 5, 'Rating must be between 1 and 5')
	invariant(body.trim().length > 0, 'Review body is required')
	invariant(body.length <= 5000, 'Review body must be under 5000 characters')
	if (title) {
		invariant(title.length <= 200, 'Review title must be under 200 characters')
	}

	// Check if user already reviewed this product
	const existing = await prisma.review.findUnique({
		where: { productId_userId: { productId, userId } },
		select: { id: true },
	})
	invariant(!existing, 'You have already reviewed this product')

	// Check verified purchase
	const { purchased, orderId } = await hasUserPurchasedProduct(userId, productId)

	const review = await prisma.review.create({
		data: {
			productId,
			userId,
			orderId: purchased ? orderId : null,
			rating,
			title: title?.trim() || null,
			body: body.trim(),
			isVerifiedPurchase: purchased,
			status: 'APPROVED', // Auto-approve for now; admin moderation added later
		},
		include: {
			user: {
				select: { id: true, username: true, name: true },
			},
		},
	})

	return review
}

/**
 * Get approved reviews for a product, ordered by most recent.
 */
export async function getProductReviews(productId: string) {
	return prisma.review.findMany({
		where: {
			productId,
			status: 'APPROVED',
		},
		include: {
			user: {
				select: { id: true, username: true, name: true },
			},
		},
		orderBy: { createdAt: 'desc' },
	})
}

/**
 * Get aggregate rating stats for a product.
 */
export async function getProductRatingStats(productId: string) {
	const stats = await prisma.review.aggregate({
		where: {
			productId,
			status: 'APPROVED',
		},
		_avg: { rating: true },
		_count: { rating: true },
	})

	return {
		averageRating: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : null,
		reviewCount: stats._count.rating,
	}
}
