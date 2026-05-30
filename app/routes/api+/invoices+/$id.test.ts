/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$id.ts'

describe('GET /api/invoices/:id', () => {
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `api-invoice-detail-${Date.now()}@example.com`,
				username: `api-invoice-detail-${Date.now()}`,
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
			method: 'GET',
			headers: { Cookie: cookieHeader },
		})
	}

	test('returns single invoice as JSON', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-API-${Date.now()}`,
				email: 'api-test@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'API User',
				shippingStreet: '123 API St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_api_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 1,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 15000,
				totalCents: 18000,
				vatTotalCents: 3000,
				vatBreakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 15000, vatCents: 3000 },
				],
				status: 'FINAL',
				issuedAt: new Date('2025-06-15'),
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/api/invoices/${invoice.id}`,
		)

		const response = await loader({
			params: { id: invoice.id },
			request,
		} as any)

		expect(response).toHaveProperty('invoice')
		const { invoice: result } = response as any
		expect(result.id).toBe(invoice.id)
		expect(result.invoiceNumber).toBe('F2025-00001')
		expect(result.fiscalYear).toBe(2025)
		expect(result.sequence).toBe(1)
		expect(result.kind).toBe('INVOICE')
		expect(result.status).toBe('FINAL')
		expect(result.subtotalCents).toBe(15000)
		expect(result.totalCents).toBe(18000)
		expect(result.vatTotalCents).toBe(3000)
		expect(result.issuedAt).toBe('2025-06-15T00:00:00.000Z')
		expect(result.vatBreakdown).toHaveLength(1)
		expect(result.vatBreakdown[0].kind).toBe('STANDARD')

		// Order reference
		expect(result.order).toBeTruthy()
		expect(result.order.orderNumber).toBe(order.orderNumber)
		expect(result.order.email).toBe('api-test@example.com')
	})

	test('returns 404 for non-existent invoice', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices/non-existent',
		)

		await expect(
			loader({
				params: { id: 'non-existent' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('blocks non-admin users', async () => {
		const regularUser = await prisma.user.create({
			data: {
				email: `api-regular-${Date.now()}@example.com`,
				username: `api-regular-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/api/invoices/some-id',
		)

		await expect(
			loader({
				params: { id: 'some-id' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('returns credit note invoice with parent reference', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-CREDIT-API-${Date.now()}`,
				email: 'credit-api@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Credit Customer',
				shippingStreet: '456 Credit St',
				shippingCity: 'Lyon',
				shippingPostal: '69001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_credit_api_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const parent = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 10,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 10000,
				totalCents: 12000,
				vatTotalCents: 2000,
				status: 'FINAL',
			},
		})

		const creditNote = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 11,
				kind: 'CREDIT_NOTE',
				orderId: order.id,
				parentInvoiceId: parent.id,
				subtotalCents: -5000,
				totalCents: -6000,
				vatTotalCents: -1000,
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/api/invoices/${creditNote.id}`,
		)

		const response = await loader({
			params: { id: creditNote.id },
			request,
		} as any)

		const { invoice: result } = response as any
		expect(result.kind).toBe('CREDIT_NOTE')
		expect(result.parentInvoiceId).toBe(parent.id)
		expect(result.parentInvoiceNumber).toBe('F2025-00010')
		expect(result.subtotalCents).toBe(-5000)
		expect(result.totalCents).toBe(-6000)
	})
})
