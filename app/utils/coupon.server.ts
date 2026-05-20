import { type Promotion } from '@prisma/client'
import { prisma } from './db.server.ts'

export type CouponValidationResult =
	| { valid: true; promotion: Promotion; discountCents: number }
	| { valid: false; error: string }

/**
 * Validates a coupon code and calculates the discount amount.
 *
 * Checks:
 * - Promotion exists and is active
 * - Within date range (startsAt / expiresAt)
 * - Has not reached maxUses
 * - Order meets minOrderAmount
 *
 * Does NOT check per-user limits here (requires userId, checked at order creation).
 *
 * @param code - The coupon code to validate
 * @param subtotalCents - The order subtotal in cents (for minOrderAmount check)
 * @returns Validation result with promotion and discount amount if valid
 */
export async function validateCoupon(
	code: string,
	subtotalCents: number,
): Promise<CouponValidationResult> {
	const normalizedCode = code.trim().toUpperCase()

	const promotion = await prisma.promotion.findUnique({
		where: { code: normalizedCode },
	})

	if (!promotion) {
		return { valid: false, error: 'Invalid coupon code' }
	}

	if (!promotion.isActive) {
		return { valid: false, error: 'This coupon is no longer active' }
	}

	const now = new Date()

	// Check start date
	if (promotion.startsAt && now < promotion.startsAt) {
		return { valid: false, error: 'This coupon is not yet active' }
	}

	// Check expiration
	if (promotion.expiresAt && now > promotion.expiresAt) {
		return { valid: false, error: 'This coupon has expired' }
	}

	// Check max total uses
	if (promotion.maxUses !== null && promotion.currentUses >= promotion.maxUses) {
		return { valid: false, error: 'This coupon has reached its usage limit' }
	}

	// Check minimum order amount
	if (
		promotion.minOrderAmount !== null &&
		subtotalCents < promotion.minOrderAmount
	) {
		return {
			valid: false,
			error: `Minimum order amount of ${(promotion.minOrderAmount / 100).toFixed(2)} required`,
		}
	}

	// Calculate discount
	const discountCents = calculateDiscount(promotion, subtotalCents)

	if (discountCents <= 0) {
		return { valid: false, error: 'Coupon does not apply to this order' }
	}

	return { valid: true, promotion, discountCents }
}

/**
 * Calculates the discount amount for a promotion.
 *
 * For PERCENTAGE: value is in basis points (e.g., 1000 = 10.00%).
 *   Discount = floor(subtotal * value / 10000)
 *
 * For FIXED_AMOUNT: value is in cents.
 *   Discount = min(value, subtotal) — cannot exceed subtotal.
 */
export function calculateDiscount(
	promotion: Pick<Promotion, 'type' | 'value'>,
	subtotalCents: number,
): number {
	if (promotion.type === 'PERCENTAGE') {
		// value is in basis points: 1000 = 10.00%
		const discount = Math.floor((subtotalCents * promotion.value) / 10000)
		return discount
	}

	if (promotion.type === 'FIXED_AMOUNT') {
		// value is in cents, cannot exceed subtotal
		return Math.min(promotion.value, subtotalCents)
	}

	return 0
}

/**
 * Checks if a user has already used this promotion the maximum allowed times.
 *
 * @param promotionId - The promotion ID
 * @param userId - The user ID
 * @returns true if user has reached their limit
 */
export async function hasUserReachedPromotionLimit(
	promotionId: string,
	userId: string,
): Promise<boolean> {
	const promotion = await prisma.promotion.findUnique({
		where: { id: promotionId },
		select: { maxUsesPerUser: true },
	})

	if (!promotion || promotion.maxUsesPerUser === null) {
		return false // No per-user limit
	}

	const userUseCount = await prisma.order.count({
		where: {
			promotionId,
			userId,
		},
	})

	return userUseCount >= promotion.maxUsesPerUser
}
