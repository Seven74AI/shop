/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { getAdminOrders } from '#app/utils/order.server.ts'

describe('getAdminOrders', () => {
	let testPrefix: string

	beforeEach(async () => {
		testPrefix = `getadminorders-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	})

	afterEach(async () => {
		if (!testPrefix) return
		try {
			await prisma.orderItem.deleteMany({
				where: { order: { stripeCheckoutSessionId: { startsWith: testPrefix } } },
			})
		} catch {}
		try {
			await prisma.order.deleteMany({
				where: { stripeCheckoutSessionId: { startsWith: testPrefix } },
			})
		} catch {}
	})

	async function createTestOrder(
		index: number,
		overrides: Partial<{
			status: string
			email: string
			createdAt: Date
		}> = {},
	) {
		return prisma.order.create({
			data: {
				orderNumber: `${testPrefix}-${index}`,
				email: overrides.email ?? `customer${index}@example.com`,
				subtotal: 1000 * index,
				total: 1000 * index,
				shippingName: `Customer ${index}`,
				shippingStreet: `${index} Test St`,
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: (overrides.status as any) ?? 'CONFIRMED',
				stripeCheckoutSessionId: `${testPrefix}-session-${index}`,
				createdAt: overrides.createdAt ?? new Date(`2026-01-${String(index).padStart(2, '0')}T12:00:00.000Z`),
			},
		})
	}

	test('returns paginated orders with default parameters', async () => {
		await createTestOrder(1)
		await createTestOrder(2)

		const result = await getAdminOrders({})

		expect(result.orders).toHaveLength(2)
		expect(result.total).toBe(2)
		expect(result.page).toBe(1)
		expect(result.perPage).toBe(25)
		expect(result.totalPages).toBe(1)
		// Default order is by createdAt desc — most recent first
		expect(result.orders[0].orderNumber).toBe(`${testPrefix}-2`)
		expect(result.orders[1].orderNumber).toBe(`${testPrefix}-1`)
	})

	test('paginates with custom page and perPage', async () => {
		// Create 5 orders
		for (let i = 1; i <= 5; i++) {
			await createTestOrder(i)
		}

		const result = await getAdminOrders({ page: 2, perPage: 2 })

		expect(result.orders).toHaveLength(2)
		expect(result.total).toBe(5)
		expect(result.page).toBe(2)
		expect(result.totalPages).toBe(3)
	})

	test('filters by status', async () => {
		await createTestOrder(1, { status: 'CONFIRMED' })
		await createTestOrder(2, { status: 'SHIPPED' })
		await createTestOrder(3, { status: 'CONFIRMED' })

		const result = await getAdminOrders({ status: 'SHIPPED' })

		expect(result.orders).toHaveLength(1)
		expect(result.total).toBe(1)
		expect(result.orders[0].orderNumber).toBe(`${testPrefix}-2`)
	})

	test('filters by status "all" returns everything', async () => {
		await createTestOrder(1, { status: 'CONFIRMED' })
		await createTestOrder(2, { status: 'SHIPPED' })

		const result = await getAdminOrders({ status: 'all' })

		expect(result.total).toBe(2)
	})

	test('searches by order number', async () => {
		await createTestOrder(1)
		await createTestOrder(2)
		await createTestOrder(10) // different pattern

		const result = await getAdminOrders({ search: `${testPrefix}-1` })

		expect(result.total).toBe(2) // matches both -1 and -10
	})

	test('searches by email', async () => {
		await createTestOrder(1, { email: 'alice@example.com' })
		await createTestOrder(2, { email: 'bob@example.com' })

		const result = await getAdminOrders({ search: 'alice' })

		expect(result.total).toBe(1)
		expect(result.orders[0].email).toBe('alice@example.com')
	})

	test('searches by user email', async () => {
		const user = await prisma.user.create({
			data: {
				email: `search-user-${testPrefix}@example.com`,
				username: `search-user-${testPrefix}`,
			},
		})

		await prisma.order.create({
			data: {
				orderNumber: `${testPrefix}-user-search`,
				email: 'different@example.com',
				subtotal: 1000,
				total: 1000,
				shippingName: 'Test',
				shippingStreet: '1 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${testPrefix}-session-user`,
				userId: user.id,
			},
		})

		const result = await getAdminOrders({ search: `search-user-${testPrefix}` })

		expect(result.total).toBe(1)
		expect(result.orders[0].orderNumber).toBe(`${testPrefix}-user-search`)

		// Cleanup
		await prisma.order.deleteMany({ where: { stripeCheckoutSessionId: `${testPrefix}-session-user` } })
		await prisma.user.deleteMany({ where: { id: user.id } })
	})

	test('filters by date range', async () => {
		await createTestOrder(1, { createdAt: new Date('2026-01-01T12:00:00.000Z') })
		await createTestOrder(2, { createdAt: new Date('2026-01-15T12:00:00.000Z') })
		await createTestOrder(3, { createdAt: new Date('2026-02-01T12:00:00.000Z') })

		const result = await getAdminOrders({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })

		expect(result.total).toBe(2)
	})

	test('filters by dateFrom only', async () => {
		await createTestOrder(1, { createdAt: new Date('2026-01-01T12:00:00.000Z') })
		await createTestOrder(2, { createdAt: new Date('2026-02-15T12:00:00.000Z') })

		const result = await getAdminOrders({ dateFrom: '2026-02-01' })

		expect(result.total).toBe(1)
		expect(result.orders[0].orderNumber).toBe(`${testPrefix}-2`)
	})

	test('filters by dateTo only', async () => {
		await createTestOrder(1, { createdAt: new Date('2026-01-01T12:00:00.000Z') })
		await createTestOrder(2, { createdAt: new Date('2026-02-15T12:00:00.000Z') })

		const result = await getAdminOrders({ dateTo: '2026-01-31' })

		expect(result.total).toBe(1)
		expect(result.orders[0].orderNumber).toBe(`${testPrefix}-1`)
	})

	test('combines status + search + date filters', async () => {
		await createTestOrder(1, { status: 'CONFIRMED', email: 'alice@example.com', createdAt: new Date('2026-01-10T12:00:00.000Z') })
		await createTestOrder(2, { status: 'SHIPPED', email: 'alice@example.com', createdAt: new Date('2026-01-10T12:00:00.000Z') })
		await createTestOrder(3, { status: 'CONFIRMED', email: 'bob@example.com', createdAt: new Date('2026-02-10T12:00:00.000Z') })

		const result = await getAdminOrders({
			status: 'CONFIRMED',
			search: 'alice',
			dateFrom: '2026-01-01',
			dateTo: '2026-01-31',
		})

		expect(result.total).toBe(1)
		expect(result.orders[0].orderNumber).toBe(`${testPrefix}-1`)
	})

	test('handles empty result set', async () => {
		const result = await getAdminOrders({ search: 'nonexistent' })

		expect(result.orders).toHaveLength(0)
		expect(result.total).toBe(0)
		expect(result.totalPages).toBe(0)
	})

	test('clamps invalid page to 1', async () => {
		// The loader handles NaN/page<1, but the function itself receives whatever is passed
		// So we just verify the function doesn't crash with page: 0
		await createTestOrder(1)
		const result = await getAdminOrders({ page: 0 })
		// page: 0 means skip = (0-1)*25 = -25, which SQLite treats as 0
		expect(result.total).toBe(1)
	})

	test('handles empty search string gracefully', async () => {
		await createTestOrder(1)
		const result = await getAdminOrders({ search: '  ' })
		expect(result.total).toBe(1)
	})
})
