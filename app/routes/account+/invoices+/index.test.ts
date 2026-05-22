/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './index.tsx'

describe('customer invoices list', () => {
	let customerUserId: string

	beforeEach(async () => {
		const user = await prisma.user.create({
			data: {
				email: `cust-inv-list-${Date.now()}@example.com`,
				username: `cust-inv-list-${Date.now()}`,
			},
		})
		customerUserId = user.id
	})

	afterEach(async () => {
		await prisma.invoice.deleteMany({})
		await prisma.session.deleteMany({})
		await prisma.orderItem.deleteMany({})
		await prisma.order.deleteMany({})
		await prisma.user.deleteMany({})
	})

	async function createAuthRequest(
		userId: string,
		url: string,
	): Promise<Request> {
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
			method: 'GET',
			headers: { Cookie: cookieHeader },
		})
	}

	async function createOrderAndInvoice(
		userId: string | null,
		overrides: { kind?: string; status?: string } = {},
	) {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-CUST-LIST-${Date.now()}`,
				email: 'customer@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Customer User',
				shippingStreet: '123 Main St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_list_${Date.now()}`,
				status: 'CONFIRMED',
				userId,
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: Date.now() % 100000,
				kind: overrides.kind ?? 'INVOICE',
				orderId: order.id,
				subtotalCents: 10000,
				totalCents: 12000,
				vatTotalCents: 2000,
				status: overrides.status ?? 'FINAL',
				issuedAt: new Date('2025-06-15'),
			},
		})

		return { order, invoice }
	}

	test('returns empty list when user has no invoices', async () => {
		const request = await createAuthRequest(
			customerUserId,
			'https://example.com/account/invoices',
		)

		const result = await loader({ request } as any)
		expect(result).toHaveProperty('invoices')
		expect(result.invoices).toEqual([])
	})

	test('returns only the customers invoices', async () => {
		const { invoice: inv1 } = await createOrderAndInvoice(customerUserId)
		const { invoice: inv2 } = await createOrderAndInvoice(customerUserId)

		const request = await createAuthRequest(
			customerUserId,
			'https://example.com/account/invoices',
		)

		const result = await loader({ request } as any)

		expect(result.invoices).toHaveLength(2)
		// Most recent first
		expect(result.invoices[0]!.id).toBe(inv2.id)
		expect(result.invoices[1]!.id).toBe(inv1.id)

		// Each invoice includes order data
		for (const inv of result.invoices) {
			expect(inv.order).toBeTruthy()
			expect(inv.order.orderNumber).toBeTruthy()
			expect(inv.order.total).toBe(12000)
		}
	})

	test('excludes invoices from other users', async () => {
		await createOrderAndInvoice(customerUserId)

		const otherUser = await prisma.user.create({
			data: {
				email: `other-cust-list-${Date.now()}@example.com`,
				username: `other-cust-list-${Date.now()}`,
			},
		})
		await createOrderAndInvoice(otherUser.id)

		const request = await createAuthRequest(
			customerUserId,
			'https://example.com/account/invoices',
		)

		const result = await loader({ request } as any)
		expect(result.invoices).toHaveLength(1)
	})

	test('excludes credit notes from the list', async () => {
		await createOrderAndInvoice(customerUserId, { kind: 'INVOICE' })
		await createOrderAndInvoice(customerUserId, { kind: 'CREDIT_NOTE' })

		const request = await createAuthRequest(
			customerUserId,
			'https://example.com/account/invoices',
		)

		const result = await loader({ request } as any)
		expect(result.invoices).toHaveLength(1)
		expect(result.invoices[0]!.kind).toBe('INVOICE')
	})

	test('shows invoices with order details', async () => {
		const { invoice, order } = await createOrderAndInvoice(customerUserId)

		const request = await createAuthRequest(
			customerUserId,
			'https://example.com/account/invoices',
		)

		const result = await loader({ request } as any)
		expect(result.invoices).toHaveLength(1)

		const inv = result.invoices[0]!
		expect(inv.id).toBe(invoice.id)
		expect(inv.status).toBe('FINAL')
		expect(inv.totalCents).toBe(12000)
		expect(inv.order.orderNumber).toBe(order.orderNumber)
		expect(inv.order.total).toBe(12000)
		expect(inv.order.createdAt).toBeTruthy()
	})

	test('unauthenticated users are rejected', async () => {
		await createOrderAndInvoice(customerUserId)

		const request = new Request('https://example.com/account/invoices', {
			method: 'GET',
		})

		// requireUserId throws redirect for unauthenticated users
		await expect(loader({ request } as any)).rejects.toThrow()
	})
})
