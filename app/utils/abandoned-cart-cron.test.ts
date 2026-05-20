/**
 * @vitest-environment node
 *
 * Integration tests for abandoned cart recovery cron script.
 * Tests the full orchestration flow: detection → email → marking.
 * Uses real Prisma with mocked email service.
 */
import { faker } from '@faker-js/faker'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { createProductData } from '#tests/product-utils.ts'
import {
	runAbandonedCartCron,
	type CronResult,
} from '../../scripts/abandoned-cart-cron.ts'

// Mock the email service (cron calls sendAbandonedCartEmail → sendEmail)
vi.mock('#app/utils/email.server.ts', () => ({
	sendEmail: vi.fn().mockResolvedValue({
		status: 'success' as const,
		data: { id: 'test-email-id' },
	}),
}))

const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>

/**
 * Creates a test user with a unique email/username.
 */
async function createTestUser(): Promise<{ id: string; email: string }> {
	const email = `cron-test-${Date.now()}-${faker.string.alphanumeric(6)}@example.com`
	const user = await prisma.user.create({
		data: {
			email,
			username: `cron_test_${Date.now()}_${faker.string.alphanumeric(4)}`,
			name: 'Cron Test User',
		},
	})
	return { id: user.id, email }
}

/**
 * Creates an abandoned cart that's 48h old with items attached.
 * Sets updatedAt into the past so findAbandonedCarts picks it up.
 */
async function createAbandonedCart(params: {
	userId?: string | null
	sessionId?: string | null
	productId: string
	itemCount?: number
	recoveryEmailCount?: number
	recoveryEmailSentAt?: Date | null
}): Promise<string> {
	const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
	const cart = await prisma.cart.create({
		data: {
			userId: params.userId ?? null,
			sessionId: params.sessionId ?? (params.userId ? null : faker.string.uuid()),
			createdAt: oldDate,
			updatedAt: oldDate,
			recoveryEmailCount: params.recoveryEmailCount ?? 0,
			recoveryEmailSentAt: params.recoveryEmailSentAt ?? null,
		},
	})
	await prisma.cartItem.create({
		data: {
			cartId: cart.id,
			productId: params.productId,
			quantity: params.itemCount ?? 1,
		},
	})
	return cart.id
}

describe('runAbandonedCartCron', () => {
	let categoryId: string
	let productId: string
	let userId: string
	let userEmail: string

	beforeEach(async () => {
		vi.clearAllMocks()

		// Ensure test category exists
		const category = await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			update: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
		})
		categoryId = category.id

		// Create test product
		const productData = createProductData()
		productData.categoryId = categoryId
		productData.price = Math.round(productData.price * 100)
		productData.status = 'ACTIVE'
		delete productData.tags

		const product = await prisma.product.create({ data: productData } as any)
		productId = product.id

		// Create a default test user
		const user = await createTestUser()
		userId = user.id
		userEmail = user.email
	})

	afterEach(async () => {
		await prisma.cartItem.deleteMany()
		await prisma.cart.deleteMany()
		await prisma.product.deleteMany()
		await prisma.category.deleteMany()
		await prisma.user.deleteMany()
	})

	describe('no abandoned carts', () => {
		test('returns zero counts when no carts exist', async () => {
			const result = await runAbandonedCartCron()

			expect(result).toEqual<CronResult>({
				sent: 0,
				skipped: 0,
				total: 0,
			})
		})

		test('returns zero counts when carts are recently updated', async () => {
			// Create a cart that was just updated (not abandoned)
			const cart = await prisma.cart.create({
				data: { userId },
			})
			await prisma.cartItem.create({
				data: { cartId: cart.id, productId, quantity: 1 },
			})

			const result = await runAbandonedCartCron()

			expect(result.total).toBe(0)
			expect(result.sent).toBe(0)
			expect(result.skipped).toBe(0)
		})
	})

	describe('single registered user cart', () => {
		test('sends recovery email and returns sent count', async () => {
			await createAbandonedCart({
				userId,
				productId,
			})

			const result = await runAbandonedCartCron()

			expect(result).toEqual<CronResult>({
				sent: 1,
				skipped: 0,
				total: 1,
			})
			expect(mockSendEmail).toHaveBeenCalledTimes(1)
			const call = mockSendEmail.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			expect(call[0]?.to).toBe(userEmail)
			expect(call[0]?.subject).toContain('item')
		})

		test('marks recovery email on the cart after sending', async () => {
			const cartId = await createAbandonedCart({
				userId,
				productId,
			})

			await runAbandonedCartCron()

			const updatedCart = await prisma.cart.findUniqueOrThrow({
				where: { id: cartId },
			})
			expect(updatedCart.recoveryEmailCount).toBe(1)
			expect(updatedCart.recoveryEmailSentAt).toBeInstanceOf(Date)
		})
	})

	describe('guest carts', () => {
		test('skips guest carts (no userId) — counts as skipped', async () => {
			await createAbandonedCart({
				sessionId: faker.string.uuid(),
				productId,
			})

			const result = await runAbandonedCartCron()

			expect(result.skipped).toBe(1)
			expect(result.sent).toBe(0)
			expect(result.total).toBe(1)
			expect(mockSendEmail).not.toHaveBeenCalled()
		})
	})

	describe('user without email', () => {
		test('skips user with null/empty email (edge case)', async () => {
			// The userId FK ensures the user exists, but they could have email=null
			// in theory. We test that the cron handles missing email gracefully.
			// Since Cart.userId has a FK to User, we use a real user.
			// The cron checks `if (!user?.email)` which requires email to be falsy.
			// In practice, email is always set. This test verifies the guard works.
			const u = await createTestUser()
			await createAbandonedCart({ userId: u.id, productId })

			// Mock the user lookup to return a user with no email
			const { prisma: realPrisma } = await import('#app/utils/db.server.ts')
			const origFindUnique = realPrisma.user.findUnique
			vi.spyOn(realPrisma.user, 'findUnique').mockResolvedValueOnce({
				id: u.id,
				email: null,
				username: 'noemail',
				name: null,
			} as any)

			const result = await runAbandonedCartCron()

			expect(result.skipped).toBe(1)
			expect(result.sent).toBe(0)
			expect(result.total).toBe(1)
			expect(mockSendEmail).not.toHaveBeenCalled()

			realPrisma.user.findUnique = origFindUnique
		})
	})

	describe('multiple carts', () => {
		test('processes multiple abandoned carts (user + guest)', async () => {
			// Use different users since Cart.userId is @unique
			const user1 = await createTestUser()
			const user2 = await createTestUser()

			await createAbandonedCart({ userId: user1.id, productId })
			await createAbandonedCart({ userId: user2.id, productId })
			await createAbandonedCart({ sessionId: faker.string.uuid(), productId })

			const result = await runAbandonedCartCron()

			expect(result.total).toBe(3)
			expect(result.sent).toBe(2)
			expect(result.skipped).toBe(1) // guest skipped
		})

		test('all registered users get emails', async () => {
			const u1 = await createTestUser()
			const u2 = await createTestUser()
			const u3 = await createTestUser()

			await createAbandonedCart({ userId: u1.id, productId })
			await createAbandonedCart({ userId: u2.id, productId })
			await createAbandonedCart({ userId: u3.id, productId })

			const result = await runAbandonedCartCron()

			expect(result.sent).toBe(3)
			expect(result.skipped).toBe(0)
			expect(result.total).toBe(3)
			expect(mockSendEmail).toHaveBeenCalledTimes(3)
		})
	})

	describe('error handling', () => {
		test('continues processing after email failure on one cart', async () => {
			const u1 = await createTestUser()
			const u2 = await createTestUser()
			const u3 = await createTestUser()

			await createAbandonedCart({ userId: u1.id, productId })
			await createAbandonedCart({ userId: u2.id, productId })
			await createAbandonedCart({ userId: u3.id, productId })

			mockSendEmail
				.mockResolvedValueOnce({
					status: 'success' as const,
					data: { id: 'email-1' },
				})
				.mockRejectedValueOnce(new Error('Resend API error'))
				.mockResolvedValueOnce({
					status: 'success' as const,
					data: { id: 'email-3' },
				})

			const result = await runAbandonedCartCron(
				undefined,
				() => {}, // no-op error logger — email failure is expected
			)

			expect(result.sent).toBe(2)
			expect(result.skipped).toBe(1)
			expect(result.total).toBe(3)
		})
	})

	describe('log output', () => {
		test('emits appropriate log messages for the full flow', async () => {
			await createAbandonedCart({ userId, productId })

			const logs: string[] = []
			const errors: string[] = []

			await runAbandonedCartCron(
				(...args: unknown[]) => logs.push(args.join(' ')),
				(...args: unknown[]) => errors.push(args.join(' ')),
			)

			expect(logs.some((l) => l.includes('🔍 Checking'))).toBe(true)
			expect(logs.some((l) => l.includes('📊 Found 1'))).toBe(true)
			expect(logs.some((l) => l.includes('🛒'))).toBe(true)
			expect(logs.some((l) => l.includes('✉️  Recovery email sent'))).toBe(true)
			expect(logs.some((l) => l.includes('✅ Done: 1'))).toBe(true)
			expect(errors).toHaveLength(0)
		})

		test('logs skipped for guest cart', async () => {
			await createAbandonedCart({ sessionId: faker.string.uuid(), productId })

			const logs: string[] = []
			await runAbandonedCartCron((...args: unknown[]) => logs.push(args.join(' ')))

			expect(logs.some((l) => l.includes('⏭️  Guest cart'))).toBe(true)
			expect(logs.some((l) => l.includes('✅ Done: 0 recovery email(s) sent, 1 skipped'))).toBe(true)
		})
	})

	describe('recovery cooldown / limits respected', () => {
		test('does not process cart at max recovery email count', async () => {
			const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
			const u = await createTestUser()
			await prisma.cart.create({
				data: {
					userId: u.id,
					createdAt: oldDate,
					updatedAt: oldDate,
					recoveryEmailCount: 3,
					recoveryEmailSentAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
				},
			})

			const result = await runAbandonedCartCron()

			expect(result.total).toBe(0)
			expect(result.sent).toBe(0)
			expect(mockSendEmail).not.toHaveBeenCalled()
		})

		test('skips cart within recovery cooldown', async () => {
			const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
			const u = await createTestUser()
			await prisma.cart.create({
				data: {
					userId: u.id,
					createdAt: oldDate,
					updatedAt: oldDate,
					recoveryEmailCount: 1,
					recoveryEmailSentAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
				},
			})

			const result = await runAbandonedCartCron()

			expect(result.total).toBe(0)
			expect(mockSendEmail).not.toHaveBeenCalled()
		})
	})
})
