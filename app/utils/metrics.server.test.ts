/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	getGMV,
	getOrdersCount,
	getRevenue,
	getConversionRate,
	getTopProducts,
	getErrorCount,
	getMetricsSnapshot,
	type TimeRange,
} from './metrics.server.ts'
import { createProductData } from '#tests/product-utils.ts'

describe('metrics.server', () => {
	// ── Helpers ──────────────────────────────────────────────

	async function createOrder(data: {
		status?: string
		total?: number
		subtotal?: number
		daysAgo?: number
	}) {
		const daysAgo = data.daysAgo ?? 0
		const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
		return prisma.order.create({
			data: {
				orderNumber: `ORD-TEST-METRICS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				email: 'test@example.com',
				subtotal: data.subtotal ?? data.total ?? 10000,
				total: data.total ?? 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
				status: (data.status as any) ?? 'CONFIRMED',
				createdAt,
			},
		})
	}

	async function createProduct() {
		const data = createProductData()
		// Price in cents (utility returns dollars)
		data.price = Math.round(data.price * 100)
		return prisma.product.create({
			data: {
				name: data.name,
				slug: data.slug,
				description: data.description,
				sku: data.sku,
				price: data.price,
				status: 'ACTIVE',
				categoryId: data.categoryId!,
			},
		})
	}

	afterEach(async () => {
		await prisma.orderItem.deleteMany({})
		await prisma.order.deleteMany({})
		await prisma.product.deleteMany({})
	})

	// ── getGMV ───────────────────────────────────────────────

	describe('getGMV', () => {
		test('sums totals of non-cancelled orders within range', async () => {
			await createOrder({ total: 5000, daysAgo: 2 })
			await createOrder({ total: 3000, daysAgo: 5 })
			await createOrder({ total: 2000, daysAgo: 10 }) // outside 7d

			const gmv = await getGMV('7d')
			expect(gmv).toBe(8000) // 5000 + 3000
		})

		test('excludes cancelled orders', async () => {
			await createOrder({ total: 5000, status: 'CANCELLED', daysAgo: 2 })
			await createOrder({ total: 3000, daysAgo: 2 })

			const gmv = await getGMV('7d')
			expect(gmv).toBe(3000)
		})

		test('returns 0 when no orders exist', async () => {
			const gmv = await getGMV('7d')
			expect(gmv).toBe(0)
		})

		test('respects 30d and 90d ranges', async () => {
			await createOrder({ total: 1000, daysAgo: 5 })
			await createOrder({ total: 2000, daysAgo: 25 })
			await createOrder({ total: 4000, daysAgo: 45 })

			const gmv30d = await getGMV('30d')
			expect(gmv30d).toBe(3000) // 1000 + 2000

			const gmv90d = await getGMV('90d')
			expect(gmv90d).toBe(7000) // 1000 + 2000 + 4000
		})
	})

	// ── getOrdersCount ───────────────────────────────────────

	describe('getOrdersCount', () => {
		test('counts all orders in range regardless of status', async () => {
			await createOrder({ daysAgo: 1 })
			await createOrder({ daysAgo: 2, status: 'CANCELLED' })
			await createOrder({ daysAgo: 3, status: 'PENDING' })

			const count = await getOrdersCount('7d')
			expect(count).toBe(3)
		})

		test('respects time range', async () => {
			await createOrder({ daysAgo: 5 })
			await createOrder({ daysAgo: 35 }) // outside 7d and 30d

			expect(await getOrdersCount('7d')).toBe(1)
			expect(await getOrdersCount('30d')).toBe(1)
			expect(await getOrdersCount('90d')).toBe(2)
		})
	})

	// ── getRevenue ───────────────────────────────────────────

	describe('getRevenue', () => {
		test('returns same value as getGMV', async () => {
			await createOrder({ total: 7500, daysAgo: 1 })
			await createOrder({ total: 2500, daysAgo: 2, status: 'CANCELLED' })

			const gmv = await getGMV('7d')
			const revenue = await getRevenue('7d')
			expect(revenue).toBe(gmv)
		})
	})

	// ── getConversionRate ────────────────────────────────────

	describe('getConversionRate', () => {
		test('calculates completed / total × 100', async () => {
			// 4 completed (CONFIRMED, SHIPPED, DELIVERED) + 1 CANCELLED + 1 PENDING
			await createOrder({ daysAgo: 1, status: 'CONFIRMED' })
			await createOrder({ daysAgo: 1, status: 'SHIPPED' })
			await createOrder({ daysAgo: 1, status: 'DELIVERED' })
			await createOrder({ daysAgo: 1, status: 'CONFIRMED' })
			await createOrder({ daysAgo: 1, status: 'CANCELLED' })
			await createOrder({ daysAgo: 1, status: 'PENDING' })

			const rate = await getConversionRate('7d')
			// 4 completed / 6 total = 66.67%
			expect(rate).toBe(66.67)
		})

		test('returns 0 when no orders exist', async () => {
			const rate = await getConversionRate('7d')
			expect(rate).toBe(0)
		})

		test('returns 100% when all orders are completed', async () => {
			await createOrder({ daysAgo: 1, status: 'DELIVERED' })
			await createOrder({ daysAgo: 1, status: 'SHIPPED' })

			const rate = await getConversionRate('7d')
			expect(rate).toBe(100)
		})
	})

	// ── getTopProducts ───────────────────────────────────────

	describe('getTopProducts', () => {
		test('returns top products by quantity sold', async () => {
			const productA = await createProduct()
			const productB = await createProduct()
			const productC = await createProduct()

			const order1 = await createOrder({ daysAgo: 2 })
			const order2 = await createOrder({ daysAgo: 3 })
			const order3 = await createOrder({ daysAgo: 4 })

			await prisma.orderItem.createMany({
				data: [
					{ orderId: order1.id, productId: productA.id, price: productA.price, quantity: 5 },
					{ orderId: order2.id, productId: productA.id, price: productA.price, quantity: 3 },
					{ orderId: order3.id, productId: productB.id, price: productB.price, quantity: 10 },
					{ orderId: order1.id, productId: productC.id, price: productC.price, quantity: 1 },
				],
			})

			const topProducts = await getTopProducts('7d', 3)

			expect(topProducts).toHaveLength(3)
			// productA: 8 total, productB: 10, productC: 1
			// Sorted by quantity desc: B (10), A (8), C (1)
		expect(topProducts[0].product!.id).toBe(productB.id)
		expect(topProducts[0].quantity).toBe(10)
		expect(topProducts[1].product!.id).toBe(productA.id)
		expect(topProducts[1].quantity).toBe(8)
		expect(topProducts[2].product!.id).toBe(productC.id)
			expect(topProducts[2].quantity).toBe(1)
		})

		test('excludes cancelled orders from top products', async () => {
			const product = await createProduct()

			const activeOrder = await createOrder({ daysAgo: 1 })
			const cancelledOrder = await createOrder({ daysAgo: 1, status: 'CANCELLED' })

			await prisma.orderItem.createMany({
				data: [
					{ orderId: activeOrder.id, productId: product.id, price: product.price, quantity: 3 },
					{ orderId: cancelledOrder.id, productId: product.id, price: product.price, quantity: 100 },
				],
			})

			const topProducts = await getTopProducts('7d', 1)
			expect(topProducts[0].quantity).toBe(3) // cancelled order excluded
		})

		test('respects limit parameter', async () => {
			const products = await Promise.all([
				createProduct(),
				createProduct(),
				createProduct(),
				createProduct(),
			])

			const order = await createOrder({ daysAgo: 1 })

			await prisma.orderItem.createMany({
				data: products.map((p, i) => ({
					orderId: order.id,
					productId: p.id,
					price: p.price,
					quantity: i + 1,
				})),
			})

			const top2 = await getTopProducts('7d', 2)
			expect(top2).toHaveLength(2)
		})

		test('returns revenue sum per product', async () => {
			const product = await createProduct()
			const order = await createOrder({ daysAgo: 1 })

			await prisma.orderItem.create({
				data: {
					orderId: order.id,
					productId: product.id,
					price: 5000, // $50.00
					quantity: 3,
				},
			})

			const topProducts = await getTopProducts('7d', 1)
			expect(topProducts[0].revenue).toBe(15000) // 5000 × 3
		})

	test('returns null product for deleted products', async () => {
		const order = await createOrder({ daysAgo: 1 })

		// Create product, create order item, then delete product
		const product = await createProduct()
		await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				price: 2000,
				quantity: 1,
			},
		})
		// Temporarily disable FK checks so we can delete the product
		// while keeping its order items (for dangling-reference test)
		await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF')
		await prisma.product.delete({ where: { id: product.id } })
		await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')

		const topProducts = await getTopProducts('7d', 1)
		expect(topProducts[0].product).toBeNull()
		expect(topProducts[0].quantity).toBe(1)
	})
	})

	// ── getErrorCount ────────────────────────────────────────

	describe('getErrorCount', () => {
		test('returns 0 (placeholder)', async () => {
			const count = await getErrorCount('7d')
			expect(count).toBe(0)
		})
	})

	// ── getMetricsSnapshot ───────────────────────────────────

	describe('getMetricsSnapshot', () => {
		test('returns all metrics in a single call', async () => {
			const product = await createProduct()
			const order = await createOrder({ total: 5000, daysAgo: 1, status: 'DELIVERED' })

			await prisma.orderItem.create({
				data: {
					orderId: order.id,
					productId: product.id,
					price: 2500,
					quantity: 2,
				},
			})

			const snapshot = await getMetricsSnapshot('7d')

			expect(snapshot).toHaveProperty('gmv')
			expect(snapshot).toHaveProperty('ordersCount')
			expect(snapshot).toHaveProperty('revenue')
			expect(snapshot).toHaveProperty('conversionRate')
			expect(snapshot).toHaveProperty('topProducts')
			expect(snapshot).toHaveProperty('errorCount')

			expect(snapshot.gmv).toBe(5000)
			expect(snapshot.ordersCount).toBe(1)
			expect(snapshot.conversionRate).toBe(100)
			expect(snapshot.topProducts).toHaveLength(1)
			expect(snapshot.errorCount).toBe(0)
		})
	})
})
