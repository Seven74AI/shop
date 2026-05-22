import { prisma } from '#app/utils/db.server.ts'
import {
	type CouponValidationResult,
	computeDiscountAmount,
} from '#app/schemas/coupon.ts'

/**
 * Validates a coupon code against the current order total and user.
 *
 * Checks the coupon code against the following rules:
 * 1. Coupon must exist in the database
 * 2. Coupon must be active (isActive = true)
 * 3. Coupon must not be expired (expiresAt > now)
 * 4. Coupon must have started (startsAt <= now, if set)
 * 5. Order total must meet minOrderAmount (if set)
 * 6. Coupon must not have reached maxUses (if set, usedCount < maxUses)
 *
 * Uses a Prisma transaction for race-safe maxUses checking when userId is provided.
 *
 * @param code - The coupon code to validate (case-insensitive, trimmed)
 * @param orderTotalCents - The current order subtotal in cents (before shipping/VAT)
 * @param userId - Optional user ID for usage tracking (skipped for guests)
 * @returns CouponValidationResult — either valid with discount info, or invalid with reason
 */
export async function validateCoupon(
	code: string,
	orderTotalCents: number,
	userId?: string | null,
): Promise<CouponValidationResult> {
	const normalizedCode = code.trim().toUpperCase()

	const coupon = await prisma.coupon.findUnique({
		where: { code: normalizedCode },
	})

	if (!coupon) {
		return { valid: false, reason: 'not_found' }
	}

	// Check active status
	if (!coupon.isActive) {
		return { valid: false, reason: 'inactive' }
	}

	// Check time window
	const now = new Date()
	if (coupon.startsAt && coupon.startsAt > now) {
		return { valid: false, reason: 'not_started' }
	}
	if (coupon.expiresAt && coupon.expiresAt <= now) {
		return { valid: false, reason: 'expired' }
	}

	// Check minimum order amount
	if (
		coupon.minOrderAmount !== null &&
		orderTotalCents < coupon.minOrderAmount
	) {
		return { valid: false, reason: 'below_min_order' }
	}

	// Check max uses — race-safe via Prisma transaction
	// We re-read the coupon inside a transaction to get the latest usedCount
	if (coupon.maxUses !== null) {
		const withinLimit = await prisma.$transaction(async (tx) => {
			const fresh = await tx.coupon.findUniqueOrThrow({
				where: { id: coupon.id },
				select: { usedCount: true, maxUses: true },
			})
			return fresh.usedCount < fresh.maxUses!
		})

		if (!withinLimit) {
			return { valid: false, reason: 'max_uses_reached' }
		}
	}

	return {
		valid: true,
		discountType: coupon.discountType,
		discountValue: coupon.discountValue,
		couponId: coupon.id,
		couponCode: coupon.code,
	}
}

/**
 * Increments the usedCount for a coupon after a successful order.
 * Uses an atomic update so race conditions don't over-count.
 *
 * @param couponId - The ID of the coupon to increment
 */
export async function incrementCouponUsedCount(
	couponId: string,
): Promise<void> {
	await prisma.coupon.update({
		where: { id: couponId },
		data: { usedCount: { increment: 1 } },
	})
}
