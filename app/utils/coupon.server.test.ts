import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { prisma } from './db.server.ts'
import {
	validateCoupon,
	calculateDiscount,
	hasUserReachedPromotionLimit,
} from './coupon.server.ts'
import type { Promotion } from '@prisma/client'

describe('calculateDiscount', () => {
	test('PERCENTAGE: 10% off 5000 cents = 500 cents discount', () => {
		// value is in basis points: 1000 = 10.00%
		const promo = { type: 'PERCENTAGE' as const, value: 1000 }
		expect(calculateDiscount(promo, 5000)).toBe(500)
	})

	test('PERCENTAGE: 25% off 19999 cents = 4999 cents (floor)', () => {
		const promo = { type: 'PERCENTAGE' as const, value: 2500 }
		expect(calculateDiscount(promo, 19999)).toBe(4999)
	})

	test('PERCENTAGE: 100% off = full subtotal', () => {
		const promo = { type: 'PERCENTAGE' as const, value: 10000 }
		expect(calculateDiscount(promo, 5000)).toBe(5000)
	})

	test('FIXED_AMOUNT: $10 off $50 order = 1000 cents', () => {
		const promo = { type: 'FIXED_AMOUNT' as const, value: 1000 }
		expect(calculateDiscount(promo, 5000)).toBe(1000)
	})

	test('FIXED_AMOUNT: discount capped at subtotal (cannot exceed)', () => {
		const promo = { type: 'FIXED_AMOUNT' as const, value: 10000 }
		expect(calculateDiscount(promo, 5000)).toBe(5000)
	})

	test('FIXED_AMOUNT: zero value = zero discount', () => {
		const promo = { type: 'FIXED_AMOUNT' as const, value: 0 }
		expect(calculateDiscount(promo, 5000)).toBe(0)
	})
})

describe('validateCoupon', () => {
	// We create promotions directly in the DB for testing
	let validPromo: Promotion

	beforeEach(async () => {
		// Clean up any leftover test data first (idempotent)
		await prisma.promotion.deleteMany({
			where: {
				code: { in: ['TEST10', 'INACTIVE', 'EXPIRED', 'FUTURE', 'MIN50', 'MAXEDOUT'] },
			},
		})

		// Create a valid active promotion
		validPromo = await prisma.promotion.create({
			data: {
				code: 'TEST10',
				description: '10% off test coupon',
				type: 'PERCENTAGE',
				value: 1000, // 10%
				isActive: true,
			},
		})

		// Create an inactive promotion
		await prisma.promotion.create({
			data: {
				code: 'INACTIVE',
				description: 'Inactive coupon',
				type: 'FIXED_AMOUNT',
				value: 500,
				isActive: false,
			},
		})

		// Create an expired promotion
		await prisma.promotion.create({
			data: {
				code: 'EXPIRED',
				description: 'Expired coupon',
				type: 'FIXED_AMOUNT',
				value: 500,
				isActive: true,
				expiresAt: new Date('2020-01-01'),
			},
		})

		// Create a not-yet-started promotion
		await prisma.promotion.create({
			data: {
				code: 'FUTURE',
				description: 'Future coupon',
				type: 'FIXED_AMOUNT',
				value: 500,
				isActive: true,
				startsAt: new Date('2099-01-01'),
			},
		})

		// Create a promotion with min order amount
		await prisma.promotion.create({
			data: {
				code: 'MIN50',
				description: 'Min $50 order',
				type: 'PERCENTAGE',
				value: 1000,
				isActive: true,
				minOrderAmount: 5000, // $50.00
			},
		})

		// Create a promotion with max total uses = 0 (already exhausted)
		await prisma.promotion.create({
			data: {
				code: 'MAXEDOUT',
				description: 'Max uses reached',
				type: 'FIXED_AMOUNT',
				value: 500,
				isActive: true,
				maxUses: 5,
				currentUses: 5,
			},
		})
	})

	afterEach(async () => {
		// Clean up test promotions
		await prisma.promotion.deleteMany({
			where: {
				code: { in: ['TEST10', 'INACTIVE', 'EXPIRED', 'FUTURE', 'MIN50', 'MAXEDOUT'] },
			},
		})
	})

	test('valid code returns promotion and discount', async () => {
		const result = await validateCoupon('TEST10', 10000) // $100 subtotal
		expect(result.valid).toBe(true)
		if (result.valid) {
			expect(result.discountCents).toBe(1000) // 10% of 10000
			expect(result.promotion.code).toBe('TEST10')
		}
	})

	test('invalid code (not found) returns error', async () => {
		const result = await validateCoupon('NONEXISTENT', 10000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.error).toBe('Invalid coupon code')
		}
	})

	test('inactive code returns error', async () => {
		const result = await validateCoupon('INACTIVE', 10000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.error).toBe('This coupon is no longer active')
		}
	})

	test('expired code returns error', async () => {
		const result = await validateCoupon('EXPIRED', 10000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.error).toBe('This coupon has expired')
		}
	})

	test('future (not yet started) code returns error', async () => {
		const result = await validateCoupon('FUTURE', 10000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.error).toBe('This coupon is not yet active')
		}
	})

	test('below min order amount returns error', async () => {
		const result = await validateCoupon('MIN50', 3000) // $30 subtotal, min is $50
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.error).toContain('Minimum order amount')
		}
	})

	test('meets min order amount returns valid', async () => {
		const result = await validateCoupon('MIN50', 6000) // $60 subtotal, min is $50
		expect(result.valid).toBe(true)
		if (result.valid) {
			expect(result.discountCents).toBe(600) // 10% of 6000
		}
	})

	test('max uses exhausted returns error', async () => {
		const result = await validateCoupon('MAXEDOUT', 10000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.error).toBe('This coupon has reached its usage limit')
		}
	})

	test('case-insensitive code matching', async () => {
		const result = await validateCoupon('test10', 5000)
		expect(result.valid).toBe(true)
	})

	test('code with whitespace is trimmed', async () => {
		const result = await validateCoupon('  TEST10  ', 5000)
		expect(result.valid).toBe(true)
	})

	test('FIXED_AMOUNT discount calculated correctly', async () => {
		// Create a fixed-amount promo dynamically
		const promo = await prisma.promotion.create({
			data: {
				code: 'FIXED5',
				description: '$5 off',
				type: 'FIXED_AMOUNT',
				value: 500, // $5.00
				isActive: true,
			},
		})

		const result = await validateCoupon('FIXED5', 3000) // $30 subtotal
		expect(result.valid).toBe(true)
		if (result.valid) {
			expect(result.discountCents).toBe(500)
		}

		// Clean up
		await prisma.promotion.delete({ where: { id: promo.id } })
	})
})

describe('hasUserReachedPromotionLimit', () => {
	let limitPromo: Promotion
	let noLimitPromo: Promotion
	let testUserId: string

	beforeEach(async () => {
		// Clean up any leftover test data first
		await prisma.order.deleteMany({ where: { userId: testUserId } }).catch(() => {})
		await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {})
		await prisma.promotion.deleteMany({
			where: { id: { in: [limitPromo?.id, noLimitPromo?.id].filter(Boolean) as string[] } },
		}).catch(() => {})

		// Create user
		const user = await prisma.user.create({
			data: {
				email: `promo-limit-test-${Date.now()}@example.com`,
				username: `promolimit${Date.now()}`,
			},
		})
		testUserId = user.id

		// Create promotion with per-user limit of 1
		limitPromo = await prisma.promotion.create({
			data: {
				code: `LIMIT1-${Date.now()}`,
				description: 'Limit 1 per user',
				type: 'FIXED_AMOUNT',
				value: 500,
				isActive: true,
				maxUsesPerUser: 1,
			},
		})

		// Create a promotion with no per-user limit (for the "no limit" test)
		noLimitPromo = await prisma.promotion.create({
			data: {
				code: `NOLIMIT-${Date.now()}`,
				description: 'No per-user limit',
				type: 'FIXED_AMOUNT',
				value: 500,
				isActive: true,
				// maxUsesPerUser intentionally null
			},
		})
	})

	afterEach(async () => {
		// Clean up
		await prisma.order.deleteMany({ where: { userId: testUserId } })
		await prisma.user.delete({ where: { id: testUserId } }).catch(() => {})
		await prisma.promotion.deleteMany({
			where: { id: { in: [limitPromo?.id, noLimitPromo?.id].filter(Boolean) as string[] } },
		}).catch(() => {})
	})

	test('returns false when per-user limit is null (no limit)', async () => {
		const result = await hasUserReachedPromotionLimit(noLimitPromo?.id ?? '', testUserId)
		// noLimitPromo has no per-user limit
		expect(result).toBe(false)
	})

	test('returns false when user has not used the promotion', async () => {
		const result = await hasUserReachedPromotionLimit(limitPromo.id, testUserId)
		expect(result).toBe(false)
	})

	test('returns true when user has reached per-user limit', async () => {
		// Create a category and product for the order
		const category = await prisma.category.create({
			data: { name: 'Limit Test Cat', slug: `limit-cat-${Date.now()}` },
		})
		const product = await prisma.product.create({
			data: {
				name: 'Limit Test Product',
				slug: `limit-prod-${Date.now()}`,
				sku: `LIMIT-SKU-${Date.now()}`,
				price: 1000,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		// Create an order with this promotion
		await prisma.order.create({
			data: {
				orderNumber: `LIMIT-ORD-${Date.now()}`,
				email: `promo-limit-test-${Date.now()}@example.com`,
				userId: testUserId,
				promotionId: limitPromo.id,
				discountCents: 500,
				couponCode: limitPromo.code,
				subtotal: 1000,
				total: 500,
				shippingName: 'Test',
				shippingStreet: '123 Test St',
				shippingCity: 'Testville',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: `cs_limit_${Date.now()}`,
				shippingCost: 0,
				status: 'CONFIRMED',
				items: {
					create: {
						productId: product.id,
						price: 1000,
						quantity: 1,
					},
				},
			},
		})

		const result = await hasUserReachedPromotionLimit(limitPromo.id, testUserId)
		expect(result).toBe(true)
	})
})
