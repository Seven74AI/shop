import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { prisma } from './db.server.ts'
import { findAbandonedCarts, processAbandonedCarts } from './abandoned-cart.server.ts'
import { createRecoveryToken } from './recovery-token.server.ts'

describe('abandoned-cart.server', () => {
	let user: { id: string; email: string } | undefined
	let category: { id: string } | undefined
	let product: { id: string; price: number } | undefined

	beforeAll(async () => {
		const ts = Date.now()

		// Clean up any leftover data from previous runs
		await prisma.abandonedCartEmail.deleteMany({
			where: { user: { username: { startsWith: 'abandonedtest' } } },
		})
		await prisma.cartItem.deleteMany({
			where: { product: { sku: { startsWith: 'ABANDONED-TEST-' } } },
		})
		await prisma.cart.deleteMany({
			where: { user: { username: { startsWith: 'abandonedtest' } } },
		})
		await prisma.product.deleteMany({
			where: { sku: { startsWith: 'ABANDONED-TEST-' } },
		})
		await prisma.category.deleteMany({
			where: { slug: { startsWith: 'test-category-abandoned-' } },
		})
		await prisma.user.deleteMany({
			where: { username: { startsWith: 'abandonedtest' } },
		})

		// Create a test user
		user = await prisma.user.create({
			data: {
				email: `abandoned-test-${ts}@example.com`,
				username: `abandonedtest${ts}`,
			},
		})

		// Create a test category
		category = await prisma.category.create({
			data: {
				name: `Test Category ${ts}`,
				slug: `test-category-abandoned-${ts}`,
			},
		})

		// Create a test product
		product = await prisma.product.create({
			data: {
				name: 'Test Product for Abandoned',
				slug: `test-product-abandoned-${ts}`,
				sku: `ABANDONED-TEST-${ts}`,
				price: 1999, // $19.99 in cents
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})
	})

	afterAll(async () => {
		// Cleanup — guard against beforeAll failure (undefined variables)
		if (user) {
			await prisma.abandonedCartEmail.deleteMany({
				where: { userId: user.id },
			})
			await prisma.cart.deleteMany({
				where: { userId: user.id },
			})
			await prisma.user.deleteMany({
				where: { id: user.id },
			})
		}
		if (product) {
			await prisma.cartItem.deleteMany({
				where: { productId: product.id },
			})
			await prisma.product.deleteMany({
				where: { id: product.id },
			})
		}
		if (category) {
			await prisma.category.deleteMany({
				where: { id: category.id },
			})
		}
	})

	test('findAbandonedCarts should return empty when no carts exist', async () => {
		const carts = await findAbandonedCarts()
		expect(
			carts.filter((c) => c.userId === user!.id),
		).toHaveLength(0)
	})

	test('findAbandonedCarts should return empty for recently updated cart', async () => {
		const cart = await prisma.cart.create({
			data: {
				userId: user!.id,
				items: {
					create: {
						productId: product!.id,
						quantity: 1,
					},
				},
			},
		})

		const carts = await findAbandonedCarts(1)
		expect(
			carts.filter((c) => c.userId === user!.id),
		).toHaveLength(0) // Cart was just created, not abandoned

		// Cleanup
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.delete({ where: { id: cart.id } })
	})

	test('findAbandonedCarts should return carts updated more than threshold ago', async () => {
		// Create a cart that appears to have been updated 2 hours ago
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

		const cart = await prisma.cart.create({
			data: {
				userId: user!.id,
				updatedAt: twoHoursAgo,
				items: {
					create: {
						productId: product!.id,
						quantity: 2,
					},
				},
			},
		})

		const carts = await findAbandonedCarts(1) // 1 hour threshold
		const userCarts = carts.filter((c) => c.userId === user!.id)

		expect(userCarts).toHaveLength(1)
		expect(userCarts[0]?.id).toBe(cart.id)
		expect(userCarts[0]?.items).toHaveLength(1)

		// Cleanup
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.delete({ where: { id: cart.id } })
	})

	test('findAbandonedCarts should not return carts with empty items', async () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

		const cart = await prisma.cart.create({
			data: {
				userId: user!.id,
				updatedAt: twoHoursAgo,
			},
		})

		const carts = await findAbandonedCarts(1)
		const userCarts = carts.filter((c) => c.userId === user!.id)

		expect(userCarts).toHaveLength(0) // Cart has no items

		// Cleanup
		await prisma.cart.delete({ where: { id: cart.id } })
	})

	test('findAbandonedCarts should exclude carts with recent recovery email', async () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

		const cart = await prisma.cart.create({
			data: {
				userId: user!.id,
				updatedAt: twoHoursAgo,
				items: {
					create: {
						productId: product!.id,
						quantity: 1,
					},
				},
			},
		})

		// Create a recent recovery email
		await prisma.abandonedCartEmail.create({
			data: {
				cartId: cart.id,
				userId: user!.id,
				email: user!.email,
				token: createRecoveryToken(cart.id, user!.id),
			},
		})

		const carts = await findAbandonedCarts(1)
		const userCarts = carts.filter((c) => c.userId === user!.id)

		expect(userCarts).toHaveLength(0) // Already sent recovery email recently

		// Cleanup
		await prisma.abandonedCartEmail.deleteMany({ where: { cartId: cart.id } })
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.delete({ where: { id: cart.id } })
	})

	test('processAbandonedCarts should send emails for abandoned carts', async () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

		const cart = await prisma.cart.create({
			data: {
				userId: user!.id,
				updatedAt: twoHoursAgo,
				items: {
					create: {
						productId: product!.id,
						quantity: 1,
					},
				},
			},
		})

		const result = await processAbandonedCarts(1)

		expect(result.total).toBeGreaterThanOrEqual(1)
		expect(result.sent).toBeGreaterThanOrEqual(1)
		expect(result.failed).toBe(0)

		// Cleanup
		await prisma.abandonedCartEmail.deleteMany({ where: { cartId: cart.id } })
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.delete({ where: { id: cart.id } })
	})
})
