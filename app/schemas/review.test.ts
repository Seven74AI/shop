import { describe, expect, test } from 'vitest'
import {
	ReviewSubmissionSchema,
	MAX_REVIEW_TITLE_LENGTH,
	MIN_REVIEW_TITLE_LENGTH,
	MAX_REVIEW_BODY_LENGTH,
	MIN_REVIEW_BODY_LENGTH,
} from './review.ts'

describe('ReviewSubmissionSchema', () => {
	describe('valid submissions', () => {
		test('accepts a valid review with all required fields', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
				body: 'I really enjoyed this product. Would recommend to anyone.',
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rating).toBe(4)
				expect(result.data.title).toBe('Great product!')
				expect(result.data.body).toBe('I really enjoyed this product. Would recommend to anyone.')
				expect(result.data.orderId).toBeUndefined()
			}
		})

		test('accepts a valid review with an optional orderId', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 5,
				title: 'Excellent!',
				body: 'Best purchase I have ever made. The quality is outstanding.',
				orderId: 'order-123',
			})

			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.orderId).toBe('order-123')
			}
		})
	})

	describe('rating validation', () => {
		test('accepts rating 1', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 1,
				title: 'Not great',
				body: 'I was somewhat disappointed with this product.',
			})
			expect(result.success).toBe(true)
		})

		test('accepts rating 3', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				title: 'Its okay',
				body: 'The product is decent for the price.',
			})
			expect(result.success).toBe(true)
		})

		test('accepts rating 5', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 5,
				title: 'Perfect!',
				body: 'Nothing else to say, just perfect.',
			})
			expect(result.success).toBe(true)
		})

		test('rejects rating 0 (below minimum)', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 0,
				title: 'Test title here',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects rating 6 (above maximum)', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 6,
				title: 'Test title here',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects negative rating', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: -1,
				title: 'Test title here',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects float rating', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3.5,
				title: 'Test title here',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects missing rating', () => {
			const result = ReviewSubmissionSchema.safeParse({
				title: 'Test title here',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects string rating', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: '4',
				title: 'Test title here',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})
	})

	describe('title validation', () => {
		test('accepts title at minimum length (5 chars)', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				title: 'Good!',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(true)
		})

		test('rejects title below minimum length (4 chars)', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				title: 'Good',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects empty title', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				title: '',
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('rejects missing title', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})

		test('accepts title at maximum length', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				title: 'a'.repeat(MAX_REVIEW_TITLE_LENGTH),
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(true)
		})

		test('rejects title above maximum length', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 3,
				title: 'a'.repeat(MAX_REVIEW_TITLE_LENGTH + 1),
				body: 'This is a test body that is long enough.',
			})
			expect(result.success).toBe(false)
		})
	})

	describe('body validation', () => {
		test('accepts body at minimum length (20 chars)', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
				body: 'Exactly twenty char!',
			})
			expect(result.success).toBe(true)
		})

		test('rejects body below minimum length (19 chars)', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
				body: 'Too short body here',
			})
			expect(result.success).toBe(false)
		})

		test('rejects empty body', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
				body: '',
			})
			expect(result.success).toBe(false)
		})

		test('rejects missing body', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
			})
			expect(result.success).toBe(false)
		})

		test('accepts body at maximum length', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
				body: 'a'.repeat(MAX_REVIEW_BODY_LENGTH),
			})
			expect(result.success).toBe(true)
		})

		test('rejects body above maximum length', () => {
			const result = ReviewSubmissionSchema.safeParse({
				rating: 4,
				title: 'Great product!',
				body: 'a'.repeat(MAX_REVIEW_BODY_LENGTH + 1),
			})
			expect(result.success).toBe(false)
		})
	})
})
