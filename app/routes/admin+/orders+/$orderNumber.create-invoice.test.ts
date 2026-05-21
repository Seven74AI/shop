/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { action } from './$orderNumber.create-invoice.ts'

describe('admin order create-invoice', () => {
	let adminUserId: string

	beforeEach(async () => {
		// Create admin user with admin role
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `admin-${Date.now()}@example.com`,
				username: `admin-${Date.now()}`,
				roles: { connect: { id: adminRole.id } },
			},
		})
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.invoice.deleteMany({})
		await prisma.session.deleteMany({})
		await prisma.orderItem.deleteMany({})
		await prisma.order.deleteMany({})
		await prisma.user.deleteMany({})
	})

	async function createAuthRequest(userId: string, url: string): Promise<Request> {
		const session = await prisma.session.create({
			data: {
				userId,
				expirationDate: getSessionExpirationDate(),
			},
		})
		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		return new Request(url, {
			method: 'POST',
			headers: { Cookie: cookieHeader },
		})
	}

	test('creates invoice for valid order', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-TEST-INV-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/orders/${order.orderNumber}/create-invoice`,
		)

		const result = await action({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		const resultData = ('data' in result ? result.data : result) as any
		expect(resultData).toHaveProperty('success', true)
		expect(resultData).toHaveProperty('invoice')
		expect(resultData.invoice).toHaveProperty('number')
		expect(resultData.invoice.number).toMatch(/^F\d{4}-\d{5}$/)

		// Verify fiscal year matches current year
		const currentYear = new Date().getFullYear()
		expect(resultData.invoice.fiscalYear).toBe(currentYear)
		expect(resultData.invoice.sequence).toBe(1)

		// Verify invoice was persisted
		const invoice = await prisma.invoice.findFirst({
			where: { orderId: order.id },
		})
		expect(invoice).toBeTruthy()
		expect(invoice!.subtotalCents).toBe(10000)
		expect(invoice!.totalCents).toBe(12000)
		expect(invoice!.status).toBe('DRAFT')
	})

	test('returns existing invoice when one already exists for the order (idempotency)', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-TEST-IDEM-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 5000,
				total: 5500,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_idem_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		// First call creates the invoice
		const request1 = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/orders/${order.orderNumber}/create-invoice`,
		)
		const result1 = await action({
			params: { orderNumber: order.orderNumber },
			request: request1,
		} as any)

		const data1 = ('data' in result1 ? result1.data : result1) as any
		expect(data1.success).toBe(true)

		// Second call should return the existing invoice (idempotent)
		const request2 = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/orders/${order.orderNumber}/create-invoice`,
		)
		const result2 = await action({
			params: { orderNumber: order.orderNumber },
			request: request2,
		} as any)

		const data2 = ('data' in result2 ? result2.data : result2) as any
		expect(data2.success).toBe(true)
		expect(data2.invoice.id).toBe(data1.invoice.id)
		expect(data2.invoice.number).toBe(data1.invoice.number)
		expect(data2.message).toContain('already exists')

		// Only one invoice should exist for the order
		const count = await prisma.invoice.count({ where: { orderId: order.id } })
		expect(count).toBe(1)
	})

	test('returns 404 for non-existent order', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/orders/NONEXISTENT/create-invoice',
		)

		await expect(
			action({
				params: { orderNumber: 'NONEXISTENT' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('returns error when trying to invoice a cancelled order', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-TEST-CANCELLED-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 0,
				stripeCheckoutSessionId: `cs_test_canc_${Date.now()}`,
				status: 'CANCELLED',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/orders/${order.orderNumber}/create-invoice`,
		)

		const result = await action({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		const resultData = ('data' in result ? result.data : result) as any
		expect(resultData).toHaveProperty('error', 'Cannot invoice cancelled order')
	})

	test('generates sequential invoice numbers for multiple orders', async () => {
		const orders = []
		const currentYear = new Date().getFullYear()

		for (let i = 0; i < 3; i++) {
			const order = await prisma.order.create({
				data: {
					orderNumber: `ORD-TEST-SEQ-${i}-${Date.now()}`,
					email: 'test@example.com',
					subtotal: 10000 + i * 1000,
					total: 12000 + i * 1000,
					shippingName: `Test User ${i}`,
					shippingStreet: '123 Test St',
					shippingCity: 'Paris',
					shippingPostal: '75001',
					shippingCountry: 'FR',
					shippingCost: 500,
					stripeCheckoutSessionId: `cs_test_seq_${i}_${Date.now()}`,
					status: 'CONFIRMED',
				},
			})
			orders.push(order)
		}

		const results: any[] = []
		for (let i = 0; i < orders.length; i++) {
			const request = await createAuthRequest(
				adminUserId,
				`https://example.com/admin/orders/${orders[i]!.orderNumber}/create-invoice`,
			)
			const result = await action({
				params: { orderNumber: orders[i]!.orderNumber },
				request,
			} as any)
			const data = 'data' in result ? result.data : result
			results.push(data)
		}

		// All should succeed
		results.forEach((r, i) => {
			expect(r.success, `Invoice ${i + 1} should succeed`).toBe(true)
		})

		// Verify sequential numbering
		for (let i = 0; i < results.length; i++) {
			expect(results[i].invoice.fiscalYear).toBe(currentYear)
			expect(results[i].invoice.sequence).toBe(i + 1)
			expect(results[i].invoice.number).toBe(
				`F${currentYear}-${String(i + 1).padStart(5, '0')}`,
			)
		}

		// Verify all persisted with correct sequences
		const allInvoices = await prisma.invoice.findMany({
			orderBy: { sequence: 'asc' },
		})
		expect(allInvoices).toHaveLength(3)
		allInvoices.forEach((inv, i) => {
			expect(inv.sequence).toBe(i + 1)
		})
	})

	test('returns error for non-admin user', async () => {
		// Create a user WITHOUT admin role
		const regularUser = await prisma.user.create({
			data: {
				email: `regular-${Date.now()}@example.com`,
				username: `regular-${Date.now()}`,
			},
		})

		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-TEST-NOADMIN-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 0,
				stripeCheckoutSessionId: `cs_test_noadmin_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			`https://example.com/admin/orders/${order.orderNumber}/create-invoice`,
		)

		// Non-admin should trigger a 403 response (thrown by requireUserWithRole)
		await expect(
			action({
				params: { orderNumber: order.orderNumber },
				request,
			} as any),
		).rejects.toThrow()
	})
})
