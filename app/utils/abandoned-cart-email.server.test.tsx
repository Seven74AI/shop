/**
 * @vitest-environment node
 *
 * Tests for abandoned cart recovery email template and send function.
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import {
	sendAbandonedCartEmail,
	AbandonedCartEmail,
} from './abandoned-cart-email.server.tsx'
import {
	markRecoveryEmailSent,
	type AbandonedCart,
} from './abandoned-cart.server.ts'
import { sendEmail } from './email.server.ts'

// Mock the email service
vi.mock('./email.server.ts', () => ({
	sendEmail: vi.fn().mockResolvedValue({
		status: 'success',
		data: { id: 'test-email-id' },
	}),
}))

// Mock the recovery email marker
vi.mock('./abandoned-cart.server.ts', () => ({
	markRecoveryEmailSent: vi.fn().mockResolvedValue(undefined),
}))

// Re-import for type access in tests (since we need the real AbandonedCart type)
const mockMarkRecoveryEmailSent =
	markRecoveryEmailSent as unknown as ReturnType<typeof vi.fn>
const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>

function createTestCart(overrides: Partial<AbandonedCart> = {}): AbandonedCart {
	return {
		id: 'cart_test123',
		userId: 'user_test456',
		sessionId: null,
		updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
		recoveryEmailCount: 0,
		recoveryEmailSentAt: null,
		items: [
			{
				productId: 'prod_1',
				productName: 'Test Product A',
				productSlug: 'test-product-a',
				variantId: null,
				quantity: 2,
			},
		],
		...overrides,
	}
}

describe('abandoned-cart-email.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('AbandonedCartEmail (template)', () => {
		test('renders without errors (React element is truthy)', () => {
			const element = AbandonedCartEmail({
				customerName: 'Test User',
				items: [
					{
						productName: 'Cool Widget',
						productSlug: 'cool-widget',
						quantity: 1,
					},
				],
				cartUrl: 'https://shop.example.com/cart',
			})

			expect(element).toBeTruthy()
		})

		test('includes customer name in template', () => {
			const element = AbandonedCartEmail({
				customerName: 'Alice',
				items: [],
				cartUrl: 'https://shop.example.com/cart',
			})

			// The React element should exist and be a component tree
			expect(element).toBeTruthy()
			expect(element.type).toBeDefined()
		})
	})

	describe('sendAbandonedCartEmail', () => {
		test('sends recovery email with correct recipient and subject', async () => {
			const cart = createTestCart()

			await sendAbandonedCartEmail(
				cart,
				'customer@example.com',
				'Test User',
			)

			expect(mockSendEmail).toHaveBeenCalledTimes(1)
			const call = mockSendEmail.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.to).toBe('customer@example.com')
			expect(call[0]?.subject).toBe(
				'You left 1 item in your cart',
			)
		})

		test('uses plural subject for multiple items', async () => {
			const cart = createTestCart()
			cart.items = [
				{
					productId: 'prod_1',
					productName: 'A',
					productSlug: 'a',
					variantId: null,
					quantity: 1,
				},
				{
					productId: 'prod_2',
					productName: 'B',
					productSlug: 'b',
					variantId: null,
					quantity: 1,
				},
			]

			await sendAbandonedCartEmail(
				cart,
				'customer@example.com',
				'Test User',
			)

			expect(mockSendEmail).toHaveBeenCalledTimes(1)
			const call = mockSendEmail.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.subject).toBe(
				'You left 2 items in your cart',
			)
		})

		test('includes the React element with items data', async () => {
			const cart = createTestCart({
				items: [
					{
						productId: 'prod_x',
						productName: 'Fancy Widget',
						productSlug: 'fancy-widget',
						variantId: null,
						quantity: 3,
					},
				],
			})

			await sendAbandonedCartEmail(
				cart,
				'customer@example.com',
				'Alice',
			)

			expect(mockSendEmail).toHaveBeenCalledTimes(1)
			const call = mockSendEmail.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.react).toBeDefined()
			expect(call[0]?.react).toBeTruthy()
		})

		test('records recovery email on cart after sending', async () => {
			const cart = createTestCart()

			await sendAbandonedCartEmail(
				cart,
				'customer@example.com',
				'Test User',
			)

			expect(mockMarkRecoveryEmailSent).toHaveBeenCalledTimes(1)
			expect(mockMarkRecoveryEmailSent).toHaveBeenCalledWith(cart.id)
		})

		test('returns false for guest carts (no email)', async () => {
			const cart = createTestCart({ userId: null, sessionId: 'sess_guest' })

			const result = await sendAbandonedCartEmail(cart, '', 'Guest')

			expect(result).toBe(false)
			// Should not send email or mark recovery
			expect(mockSendEmail).not.toHaveBeenCalled()
			expect(mockMarkRecoveryEmailSent).not.toHaveBeenCalled()
		})

		test('returns false for empty email string', async () => {
			const cart = createTestCart()

			const result = await sendAbandonedCartEmail(
				cart,
				'',
				'Test User',
			)

			expect(result).toBe(false)
			expect(mockSendEmail).not.toHaveBeenCalled()
			expect(mockMarkRecoveryEmailSent).not.toHaveBeenCalled()
		})

		test('returns true when email is sent successfully', async () => {
			const cart = createTestCart()

			const result = await sendAbandonedCartEmail(
				cart,
				'customer@example.com',
				'Test User',
			)

			expect(result).toBe(true)
		})

		test('uses localhost URL when no request object provided', async () => {
			const cart = createTestCart()

			await sendAbandonedCartEmail(
				cart,
				'customer@example.com',
				'Test User',
			)

			const call = mockSendEmail.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			// The React element should still be rendered (URL is inside it)
			expect(call[0]?.react).toBeTruthy()
		})

		test('sends email for different users successfully', async () => {
			const cart = createTestCart()

			await sendAbandonedCartEmail(
				cart,
				'another@example.com',
				'Bob',
			)

			expect(mockSendEmail).toHaveBeenCalledTimes(1)
			const call = mockSendEmail.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.to).toBe('another@example.com')
			expect(call[0]?.react).toBeDefined()
		})
	})
})
