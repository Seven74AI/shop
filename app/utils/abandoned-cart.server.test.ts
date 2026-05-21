import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { faker } from '@faker-js/faker'
import { createProductData } from '#tests/product-utils.ts'
import { UNCATEGORIZED_CATEGORY_ID } from './category.ts'
import { prisma } from './db.server.ts'
import {
	findAbandonedCarts,
	markRecoveryEmailSent,
	cleanupStaleGuestCarts,
} from './abandoned-cart.server.ts'

describe('findAbandonedCarts', () => {
	let categoryId: string
	let productId: string
	let userId: string
	let userId2: string

	beforeEach(async () => {
		// Create test category
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

		// Create test product (delete tags — Prisma v7 rejects empty arrays on relation fields)
		const productData = createProductData()
		productData.categoryId = categoryId
		productData.price = Math.round(productData.price * 100)
		productData.status = 'ACTIVE'
		delete productData.tags

		const product = await prisma.product.create({ data: productData } as any)
		productId = product.id

		// Create test users
		const user = await prisma.user.create({
			data: {
				email: `abandoned-test-${Date.now()}@example.com`,
				username: `abandoned_test_${Date.now()}`,
			},
		})
		userId = user.id

		const user2 = await prisma.user.create({
			data: {
				email: `abandoned-test2-${Date.now()}@example.com`,
				username: `abandoned_test2_${Date.now()}`,
			},
		})
		userId2 = user2.id
	})

	afterEach(async () => {
		// Clean up all created data
		await prisma.cartItem.deleteMany()
		await prisma.cart.deleteMany()
		await prisma.product.deleteMany()
		await prisma.category.deleteMany()
		await prisma.user.deleteMany()
	})

	test('returns empty array when no carts exist', async () => {
		const result = await findAbandonedCarts(prisma)
		expect(result).toEqual([])
	})

	test('returns empty array when cart was recently updated', async () => {
		const cart = await prisma.cart.create({
			data: { userId },
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId,
				quantity: 2,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
		})
		expect(result).toEqual([])
	})

	test('returns abandoned cart when older than threshold with items', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48h ago
		const cart = await prisma.cart.create({
			data: {
				userId,
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId,
				quantity: 1,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
		})
		expect(result).toHaveLength(1)
		const first = result[0]!
		expect(first.id).toBe(cart.id)
		expect(first.userId).toBe(userId)
		expect(first.items).toHaveLength(1)
		expect(first.items[0]!.productId).toBe(productId)
		expect(first.items[0]!.quantity).toBe(1)
		expect(first.recoveryEmailCount).toBe(0)
		expect(first.recoveryEmailSentAt).toBeNull()
	})

	test('returns empty when cart has no items', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
		await prisma.cart.create({
			data: {
				userId,
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
		})
		expect(result).toEqual([])
	})

	test('excludes carts that had a recovery email within cooldown', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
		const recentRecoveryDate = new Date(Date.now() - 1 * 60 * 60 * 1000) // 1h ago

		const cart = await prisma.cart.create({
			data: {
				userId,
				createdAt: oldDate,
				updatedAt: oldDate,
				recoveryEmailSentAt: recentRecoveryDate,
				recoveryEmailCount: 1,
			},
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId,
				quantity: 1,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
			recoveryCooldownHours: 24,
		})
		expect(result).toEqual([])
	})

	test('includes carts where recovery email cooldown has passed', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
		const oldRecoveryDate = new Date(Date.now() - 72 * 60 * 60 * 1000) // 72h ago

		const cart = await prisma.cart.create({
			data: {
				userId,
				createdAt: oldDate,
				updatedAt: oldDate,
				recoveryEmailSentAt: oldRecoveryDate,
				recoveryEmailCount: 1,
			},
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId,
				quantity: 1,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
			recoveryCooldownHours: 24,
		})
		expect(result).toHaveLength(1)
		expect(result[0]!.id).toBe(cart.id)
	})

	test('excludes carts that reached max recovery emails', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
		const oldRecoveryDate = new Date(Date.now() - 72 * 60 * 60 * 1000)

		const cart = await prisma.cart.create({
			data: {
				userId,
				createdAt: oldDate,
				updatedAt: oldDate,
				recoveryEmailSentAt: oldRecoveryDate,
				recoveryEmailCount: 3,
			},
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId,
				quantity: 1,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
			maxRecoveryEmails: 3,
		})
		// recoveryEmailCount (3) is NOT less than maxRecoveryEmails (3), so excluded
		expect(result).toEqual([])
	})

	test('respects limit parameter', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)

		// Create 3 abandoned carts (use sessionId to avoid unique userId constraint)
		for (let i = 0; i < 3; i++) {
			const cart = await prisma.cart.create({
				data: {
					sessionId: `limit-test-${i}-${Date.now()}`,
					createdAt: new Date(oldDate.getTime() - i * 1000),
					updatedAt: new Date(oldDate.getTime() - i * 1000),
				},
			})
			await prisma.cartItem.create({
				data: {
					cartId: cart.id,
					productId,
					quantity: 1,
				},
			})
		}

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
			limit: 2,
		})
		expect(result).toHaveLength(2)
	})

	test('orders results by updatedAt ascending (oldest first)', async () => {
		const baseDate = new Date(Date.now() - 48 * 60 * 60 * 1000)

		// Use sessionIds to avoid unique userId constraint per cart
		const cart1 = await prisma.cart.create({
			data: {
				sessionId: `order-test-1-${Date.now()}`,
				createdAt: new Date(baseDate.getTime() - 2000),
				updatedAt: new Date(baseDate.getTime() - 2000),
			},
		})
		await prisma.cartItem.create({
			data: { cartId: cart1.id, productId, quantity: 1 },
		})

		const cart2 = await prisma.cart.create({
			data: {
				sessionId: `order-test-2-${Date.now()}`,
				createdAt: new Date(baseDate.getTime() - 1000),
				updatedAt: new Date(baseDate.getTime() - 1000),
			},
		})
		await prisma.cartItem.create({
			data: { cartId: cart2.id, productId, quantity: 1 },
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
		})
		expect(result).toHaveLength(2)
		// cart1 is older so should come first
		expect(result[0]!.id).toBe(cart1.id)
		expect(result[1]!.id).toBe(cart2.id)
	})

	test('handles guest carts (sessionId, no userId)', async () => {
		const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
		const sessionId = faker.string.uuid()

		const cart = await prisma.cart.create({
			data: {
				sessionId,
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId,
				quantity: 1,
			},
		})

		const result = await findAbandonedCarts(prisma, {
			abandonmentThresholdHours: 24,
		})
		expect(result).toHaveLength(1)
		expect(result[0]!.sessionId).toBe(sessionId)
		expect(result[0]!.userId).toBeNull()
	})
})

describe('markRecoveryEmailSent', () => {
	let categoryId: string
	let productId: string
	let userId: string

	beforeEach(async () => {
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

		// Create test product (delete tags — Prisma v7 rejects empty arrays)
		const productData = createProductData()
		productData.categoryId = categoryId
		productData.price = Math.round(productData.price * 100)
		productData.status = 'ACTIVE'
		delete productData.tags

		const product = await prisma.product.create({ data: productData } as any)
		productId = product.id

		const user = await prisma.user.create({
			data: {
				email: `recovery-test-${Date.now()}@example.com`,
				username: `recovery_test_${Date.now()}`,
			},
		})
		userId = user.id
	})

	afterEach(async () => {
		await prisma.cartItem.deleteMany()
		await prisma.cart.deleteMany()
		await prisma.product.deleteMany()
		await prisma.category.deleteMany()
		await prisma.user.deleteMany()
	})

	test('sets recoveryEmailSentAt and increments count from 0', async () => {
		const cart = await prisma.cart.create({
			data: {
				userId,
				recoveryEmailCount: 0,
				recoveryEmailSentAt: null,
			},
		})

		await markRecoveryEmailSent(cart.id, prisma)

		const updated = await prisma.cart.findUniqueOrThrow({
			where: { id: cart.id },
		})
		expect(updated.recoveryEmailCount).toBe(1)
		expect(updated.recoveryEmailSentAt).toBeInstanceOf(Date)
		expect(updated.recoveryEmailSentAt!.getTime()).toBeGreaterThan(
			Date.now() - 5000,
		)
	})

	test('increments existing count', async () => {
		const cart = await prisma.cart.create({
			data: {
				userId,
				recoveryEmailCount: 2,
				recoveryEmailSentAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
			},
		})

		await markRecoveryEmailSent(cart.id, prisma)

		const updated = await prisma.cart.findUniqueOrThrow({
			where: { id: cart.id },
		})
		expect(updated.recoveryEmailCount).toBe(3)
	})
})

describe('cleanupStaleGuestCarts', () => {
	beforeEach(async () => {
		await prisma.cartItem.deleteMany()
		await prisma.cart.deleteMany()
		await prisma.user.deleteMany()
	})

	afterEach(async () => {
		await prisma.cartItem.deleteMany()
		await prisma.cart.deleteMany()
		await prisma.user.deleteMany()
	})

	test('deletes old guest carts with no items', async () => {
		const oldDate = new Date(Date.now() - 200 * 60 * 60 * 1000) // 200h ago

		await prisma.cart.create({
			data: {
				sessionId: 'stale-guest-1',
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})
		await prisma.cart.create({
			data: {
				sessionId: 'stale-guest-2',
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})

		const deleted = await cleanupStaleGuestCarts(168, prisma) // 7 days
		expect(deleted).toBe(2)

		const remaining = await prisma.cart.count()
		expect(remaining).toBe(0)
	})

	test('does not delete guest carts with items', async () => {
		const category = await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			update: { name: 'Test', slug: `test-${Date.now()}` },
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Test',
				slug: `test-${Date.now()}`,
			},
		})
		const productData = createProductData()
		productData.categoryId = category.id
		productData.price = 1000
		productData.status = 'ACTIVE'
		delete productData.tags
		const product = await prisma.product.create({ data: productData } as any)

		const oldDate = new Date(Date.now() - 200 * 60 * 60 * 1000)
		const cart = await prisma.cart.create({
			data: {
				sessionId: 'guest-with-items',
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId: product.id,
				quantity: 1,
			},
		})

		const deleted = await cleanupStaleGuestCarts(168, prisma)
		expect(deleted).toBe(0)

		const remaining = await prisma.cart.findUnique({
			where: { id: cart.id },
		})
		expect(remaining).not.toBeNull()
	})

	test('does not delete user carts', async () => {
		const user = await prisma.user.create({
			data: {
				email: `cleanup-test-${Date.now()}@example.com`,
				username: `cleanup_test_${Date.now()}`,
			},
		})

		const oldDate = new Date(Date.now() - 200 * 60 * 60 * 1000)
		await prisma.cart.create({
			data: {
				userId: user.id,
				createdAt: oldDate,
				updatedAt: oldDate,
			},
		})

		const deleted = await cleanupStaleGuestCarts(168, prisma)
		expect(deleted).toBe(0)

		const remaining = await prisma.cart.count()
		expect(remaining).toBe(1)
	})

	test('does not delete recent guest carts', async () => {
		await prisma.cart.create({
			data: {
				sessionId: 'recent-guest',
			},
		})

		const deleted = await cleanupStaleGuestCarts(168, prisma)
		expect(deleted).toBe(0)

		const remaining = await prisma.cart.count()
		expect(remaining).toBe(1)
	})
})
