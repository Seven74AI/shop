/**
 * @vitest-environment node
 */
import { describe, expect, test } from 'vitest'
import { PromotionSchema } from './promotion.ts'

describe('PromotionSchema', () => {
	test('validates a valid promotion', () => {
		const result = PromotionSchema.safeParse({
			name: 'Summer Sale',
			discountType: 'PERCENTAGE',
			discountValue: 2500,
			isActive: true,
		})
		expect(result.success).toBe(true)
	})

	test('validates a FIXED_AMOUNT promotion', () => {
		const result = PromotionSchema.safeParse({
			name: '5 EUR Off',
			discountType: 'FIXED_AMOUNT',
			discountValue: 500,
			isActive: true,
		})
		expect(result.success).toBe(true)
	})

	test('rejects empty name', () => {
		const result = PromotionSchema.safeParse({
			name: '',
			discountType: 'PERCENTAGE',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('rejects name over 100 characters', () => {
		const result = PromotionSchema.safeParse({
			name: 'A'.repeat(101),
			discountType: 'PERCENTAGE',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('rejects invalid discount type', () => {
		const result = PromotionSchema.safeParse({
			name: 'Test',
			discountType: 'INVALID',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('rejects zero discount value', () => {
		const result = PromotionSchema.safeParse({
			name: 'Test',
			discountType: 'PERCENTAGE',
			discountValue: 0,
			isActive: true,
		})
		expect(result.success).toBe(false)
	})

	test('allows optional description', () => {
		const result = PromotionSchema.safeParse({
			name: 'Test',
			description: 'A test promotion',
			discountType: 'PERCENTAGE',
			discountValue: 1000,
			isActive: true,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.description).toBe('A test promotion')
		}
	})

	test('defaults isActive to true when not provided', () => {
		const result = PromotionSchema.safeParse({
			name: 'Test',
			discountType: 'PERCENTAGE',
			discountValue: 1000,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.isActive).toBe(true)
		}
	})

	test('handles string number for discountValue', () => {
		const result = PromotionSchema.safeParse({
			name: 'Test',
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
