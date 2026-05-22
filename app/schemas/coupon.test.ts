/**
 * @vitest-environment node
 */
import { describe, expect, test } from 'vitest'
import { generateCouponCode, CouponSchema } from './coupon.ts'

describe('generateCouponCode', () => {
	test('generates an 8-character string', () => {
		const code = generateCouponCode()
		expect(code.length).toBe(8)
	})

	test('generates only uppercase alphanumeric characters', () => {
		for (let i = 0; i < 100; i++) {
			const code = generateCouponCode()
			expect(code).toMatch(/^[A-Z0-9]{8}$/)
		}
	})

	test('generates different codes on successive calls', () => {
		const codes = new Set<string>()
		for (let i = 0; i < 50; i++) {
			codes.add(generateCouponCode())
		}
		// Extremely unlikely to have fewer than 40 unique codes out of 50
		expect(codes.size).toBeGreaterThan(40)
	})
})

describe('CouponSchema', () => {
	test('validates a valid coupon', () => {
		const result = CouponSchema.safeParse({
			code: 'SUMMER25',
			discountType: 'PERCENTAGE',
			discountValue: 2500,
			isActive: true,
		})
		expect(result.success).toBe(true)
	})

	test('validates a FIXED_AMOUNT coupon', () => {
		const result = CouponSchema.safeParse({
			code: 'FLAT10',
			discountType: 'FIXED_AMOUNT',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(true)
	})

	test('rejects empty code', () => {
		const result = CouponSchema.safeParse({
			code: '',
			discountType: 'PERCENTAGE',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('rejects lowercase code', () => {
		const result = CouponSchema.safeParse({
			code: 'summer25',
			discountType: 'PERCENTAGE',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('rejects invalid discount type', () => {
		const result = CouponSchema.safeParse({
			code: 'TEST',
			discountType: 'INVALID',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('rejects negative discount value', () => {
		const result = CouponSchema.safeParse({
			code: 'TEST',
			discountType: 'PERCENTAGE',
			discountValue: -100,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('allows optional fields with defaults', () => {
		const result = CouponSchema.safeParse({
			code: 'BASIC10',
			discountType: 'PERCENTAGE',
			discountValue: 1000,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.isActive).toBe(true)
			expect(result.data.minOrderAmount).toBeUndefined()
			expect(result.data.maxUses).toBeUndefined()
		}
	})

	test('validates with minOrderAmount and maxUses', () => {
		const result = CouponSchema.safeParse({
			code: 'BIGSPEND',
			discountType: 'PERCENTAGE',
			discountValue: 2000,
			minOrderAmount: 5000,
			maxUses: 100,
			isActive: true,
		})
		expect(result.success).toBe(true)
	})

	test('handles string number for discountValue', () => {
		const result = CouponSchema.safeParse({
			code: 'TEST',
			discountType: 'PERCENTAGE',
			discountValue: '1500',
			isActive: true,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.discountValue).toBe(1500)
		}
	})
})
