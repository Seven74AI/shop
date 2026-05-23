import { invariant } from '@epic-web/invariant'
import { prisma } from './db.server.ts'
import { ReviewSubmissionSchema } from '#app/schemas/review.ts'

export interface SubmitReviewInput {
	userId: string
	productId: string
	rating: number
	title: string
	body: string
	orderId?: string
}

export interface SubmitReviewResult {
	review: {
		id: string
		rating: number
		title: string | null
		body: string | null
		orderId: string | null
		isVerifiedPurchase: boolean
		isApproved: boolean
		createdAt: Date
	}
}

/**
 * Check if a user has purchased a product by looking at their completed orders.
 * If orderId is provided, verify that specific order belongs to the user and
 * contains the product. Otherwise, check all of the user's orders.
 */
async function hasUserPurchasedProduct(
	userId: string,
	productId: string,
	orderId?: string,
): Promise<boolean> {
	if (orderId) {
		// Verify the specific order belongs to the user and contains the product
		const order = await prisma.order.findFirst({
			where: {
				id: orderId,
				userId,
				status: { in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] },
				items: {
					some: { productId },
				},
			},
			select: { id: true },
		})
		return !!order
	}

	// Check all user's orders for the product
	const orderItem = await prisma.orderItem.findFirst({
		where: {
			productId,
			order: {
				userId,
				status: { in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] },
			},
		},
		select: { id: true },
	})
	return !!orderItem
}

/**
 * Submit a product review.
 *
 * Validates input with Zod, checks if the user is a verified purchaser,
 * prevents duplicate reviews, and stores the review (pending admin approval).
 *
 * @throws {Error} if validation fails, product not found, or duplicate review.
 */
export async function submitReview(
	input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
	// 1. Validate input with Zod
	const parsed = ReviewSubmissionSchema.safeParse(input)
	if (!parsed.success) {
		const errors = parsed.error.flatten().fieldErrors
		const messages = Object.entries(errors)
			.map(([field, msgs]) => `${field}: ${msgs?.join(', ')}`)
			.join('; ')
		throw new Error(`Validation failed: ${messages}`)
	}

	const { rating, title, body, orderId } = parsed.data
	const { userId, productId } = input

	// 2. Verify the product exists
	const product = await prisma.product.findUnique({
		where: { id: productId },
		select: { id: true },
	})
	invariant(product, `Product not found: ${productId}`)

	// 3. Check for duplicate review (one per user per product, ignoring orderId)
	const existing = await prisma.review.findFirst({
		where: {
			userId,
			productId,
		},
		select: { id: true },
	})
	invariant(!existing, 'You have already reviewed this product')

	// 4. Check if user is a verified purchaser
	const isVerifiedPurchase = await hasUserPurchasedProduct(
		userId,
		productId,
		orderId ?? undefined,
	)

	// 5. Create the review (pending approval)
	const review = await prisma.review.create({
		data: {
			userId,
			productId,
			rating,
			title,
			body: body ?? undefined,
			orderId: orderId ?? undefined,
			isVerifiedPurchase,
			isApproved: false,
		},
		select: {
			id: true,
			rating: true,
			title: true,
			body: true,
			orderId: true,
			isVerifiedPurchase: true,
			isApproved: true,
			createdAt: true,
		},
	})

	return { review }
}
