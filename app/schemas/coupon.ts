import { z } from 'zod'

/**
 * Maximum length of a coupon code string.
 */
export const MAX_COUPON_CODE_LENGTH = 50

/**
 * Schema for validating a coupon code input from the checkout form.
 *
 * @description Validates the coupon code string — trimming, case normalization,
 * and length check. The actual business rules (expiry, usage limits, etc.)
 * are validated server-side in validateCoupon().
 *
 * @example
 * ```ts
 * const { couponCode } = CouponCodeSchema.parse({ couponCode: "SAVE10" })
 * ```
 */
export const CouponCodeSchema = z.object({
	couponCode: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Coupon code is required' : 'Not a string',
			})
			.min(1, { error: 'Coupon code is required' })
			.max(MAX_COUPON_CODE_LENGTH, {
				error: `Coupon code must be less than ${MAX_COUPON_CODE_LENGTH} characters`,
			})
			.trim()
			.toUpperCase()
			.refine((val) => /^[A-Z0-9_-]+$/.test(val), {
				error:
					'Coupon code can only contain letters, numbers, hyphens, and underscores',
			}),
	),
})

/**
 * Result of a coupon validation — success or one of several failure reasons.
 */
export type CouponValidationResult =
	| { valid: true; discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number; couponId: string; couponCode: string }
	| { valid: false; reason: CouponErrorReason }

/**
 * Possible reasons a coupon cannot be applied.
 */
export type CouponErrorReason =
	| 'not_found'
	| 'inactive'
	| 'expired'
	| 'not_started'
	| 'below_min_order'
	| 'max_uses_reached'

/**
 * Human-readable error messages for each coupon error reason.
 */
export const couponErrorMessages: Record<CouponErrorReason, string> = {
	not_found: 'Coupon code is not valid',
	inactive: 'This coupon is no longer active',
	expired: 'This coupon has expired',
	not_started: 'This coupon is not yet active',
	below_min_order: 'Order total does not meet the minimum for this coupon',
	max_uses_reached: 'This coupon has reached its maximum number of uses',
}

/**
 * Given a validated coupon and order total, compute the discount amount in cents.
 */
export function computeDiscountAmount(
	discountType: 'PERCENTAGE' | 'FIXED_AMOUNT',
	discountValue: number,
	orderTotalCents: number,
): number {
	if (discountType === 'FIXED_AMOUNT') {
		return Math.min(discountValue, orderTotalCents)
	}
	// PERCENTAGE: discountValue is basis points (1000 = 10.00%)
	const discountCents = Math.round((orderTotalCents * discountValue) / 10000)
	return Math.min(discountCents, orderTotalCents)
}
