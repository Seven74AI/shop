/**
 * @vitest-environment node
 */
import { test, expect } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	validateCoupon,
	incrementCouponUsedCount,
} from '#app/utils/coupon.server.ts'
import { computeDiscountAmount } from '#app/schemas/coupon.ts'

test.describe('validateCoupon', () => {
	test('returns valid for an active, non-expired percentage coupon', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `TESTPCT${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000, // 10.00%
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000) // $50.00 order

		expect(result.valid).toBe(true)
		if (result.valid) {
			expect(result.discountType).toBe('PERCENTAGE')
			expect(result.discountValue).toBe(1000)
			expect(result.couponCode).toBe(coupon.code)
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('returns valid for a fixed-amount coupon', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `FIXED${Date.now()}`,
				discountType: 'FIXED_AMOUNT',
				discountValue: 500, // €5.00
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 10000) // $100.00 order

		expect(result.valid).toBe(true)
		if (result.valid) {
			expect(result.discountType).toBe('FIXED_AMOUNT')
			expect(result.discountValue).toBe(500)
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('returns not_found for unknown coupon code', async () => {
		const result = await validateCoupon('NONEXISTENT', 5000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.reason).toBe('not_found')
		}
	})

	test('returns inactive for disabled coupon', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `INACTIVE${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				expiresAt: tomorrow,
				isActive: false,
			},
		})

		const result = await validateCoupon(coupon.code, 5000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.reason).toBe('inactive')
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('returns expired for past-due coupon', async () => {
		const yesterday = new Date(Date.now() - 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `EXPIRED${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				expiresAt: yesterday,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.reason).toBe('expired')
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('returns not_started for future start date', async () => {
		const nextWeek = new Date(Date.now() + 7 * 86400000)
		const nextMonth = new Date(Date.now() + 30 * 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `FUTURE${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				startsAt: nextWeek,
				expiresAt: nextMonth,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.reason).toBe('not_started')
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('returns below_min_order when order total is too low', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `MIN100${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				minOrderAmount: 10000, // minimum $100.00 order
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000) // $50.00 — under minimum
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.reason).toBe('below_min_order')
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('valid when order meets minimum', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `MIN100OK${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				minOrderAmount: 10000,
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 15000) // $150.00 — above minimum
		expect(result.valid).toBe(true)

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('returns max_uses_reached when usedCount >= maxUses', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `MAXED${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				maxUses: 5,
				usedCount: 5,
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000)
		expect(result.valid).toBe(false)
		if (!result.valid) {
			expect(result.reason).toBe('max_uses_reached')
		}

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('valid when usedCount < maxUses', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `UNDER${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				maxUses: 5,
				usedCount: 4,
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000)
		expect(result.valid).toBe(true)

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('valid coupon is case-insensitive', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: 'SAVE10',
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon('save10', 5000)
		expect(result.valid).toBe(true)

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})

	test('coupon with null maxUses allows unlimited uses', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `UNLIMIT${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				maxUses: null,
				expiresAt: tomorrow,
				isActive: true,
			},
		})

		const result = await validateCoupon(coupon.code, 5000)
		expect(result.valid).toBe(true)

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})
})

test.describe('incrementCouponUsedCount', () => {
	test('increments usedCount atomically', async () => {
		const now = new Date()
		const tomorrow = new Date(now.getTime() + 86400000)

		const coupon = await prisma.coupon.create({
			data: {
				code: `INCR${Date.now()}`,
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				expiresAt: tomorrow,
				isActive: true,
				usedCount: 3,
			},
		})

		await incrementCouponUsedCount(coupon.id)

		const updated = await prisma.coupon.findUniqueOrThrow({
			where: { id: coupon.id },
			select: { usedCount: true },
		})

		expect(updated.usedCount).toBe(4)

		await prisma.coupon.delete({ where: { id: coupon.id } })
	})
})

test.describe('computeDiscountAmount', () => {
	test('fixed amount discount', () => {
		expect(computeDiscountAmount('FIXED_AMOUNT', 500, 10000)).toBe(500)
	})

	test('fixed amount capped at order total', () => {
		expect(computeDiscountAmount('FIXED_AMOUNT', 20000, 5000)).toBe(5000)
	})

	test('percentage discount (10% = 1000 bps)', () => {
		expect(computeDiscountAmount('PERCENTAGE', 1000, 10000)).toBe(1000) // 10% of $100
	})

	test('percentage discount (5% = 500 bps)', () => {
		expect(computeDiscountAmount('PERCENTAGE', 500, 20000)).toBe(1000) // 5% of $200
	})

	test('percentage discount capped at order total', () => {
		expect(computeDiscountAmount('PERCENTAGE', 10000, 100)).toBe(100) // capped
	})

	test('percentage discount with rounding', () => {
		// 15% of 9999 = 1499.85 → rounding to 1500
		expect(computeDiscountAmount('PERCENTAGE', 1500, 9999)).toBe(1500)
	})
})
