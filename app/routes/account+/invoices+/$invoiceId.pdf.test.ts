/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$invoiceId[.]pdf.ts'

// Mock @react-pdf/renderer to avoid actual PDF rendering in tests.
vi.mock('@react-pdf/renderer', () => {
	return {
		Document: () => null,
		Page: () => null,
		Text: () => null,
		View: () => null,
		StyleSheet: { create: (s: unknown) => s },
		renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
		renderToStream: vi.fn().mockImplementation(() => {
			const { Readable } = require('node:stream') as typeof import('node:stream')
			return Promise.resolve(
				new Readable({
					read() {
						this.push(Buffer.from('%PDF-1.4 mock'))
						this.push(null)
					},
				}),
			)
		}),
	}
})

describe('customer invoice PDF download', () => {
	let customerUserId: string

	beforeEach(async () => {
		const user = await prisma.user.create({
			data: {
				email: `customer-pdf-${Date.now()}@example.com`,
				username: `customer-pdf-${Date.now()}`,
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
		overrides: {
			userId?: string | null
			email?: string
		} = {},
	) {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-CUST-PDF-${Date.now()}`,
				email: overrides.email ?? 'customer@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'Customer User',
				shippingStreet: '456 Customer St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_cust_pdf_${Date.now()}`,
				status: 'CONFIRMED',
				userId: 'userId' in overrides ? overrides.userId : customerUserId,
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 42,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 15000,
				totalCents: 18000,
				vatTotalCents: 3000,
				vatBreakdown: [
					{
						kind: 'STANDARD',
						rate: 2000,
						baseCents: 15000,
						vatCents: 3000,
					},
				],
				status: 'FINAL',
				issuedAt: new Date('2025-06-15'),
			},
		})

		return { order, invoice }
	}

	test('returns PDF with correct content-type for customer-owned invoice', async () => {
		const { invoice } = await createOrderAndInvoice()

		const request = await createAuthRequest(
			customerUserId,
			`https://example.com/account/invoices/${invoice.id}.pdf`,
		)

		const response = await loader({
			params: { invoiceId: invoice.id },
			request,
		} as any)

		expect(response).toBeInstanceOf(Response)
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
		expect(response.headers.get('Content-Disposition')).toContain(
			'invoice-F2025-00042.pdf',
		)
		expect(response.headers.get('Content-Disposition')).toContain('inline')
	})

	test('returns 404 for non-existent invoice', async () => {
		const request = await createAuthRequest(
			customerUserId,
			'https://example.com/account/invoices/non-existent-id.pdf',
		)

		await expect(
			loader({
				params: { invoiceId: 'non-existent-id' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('blocks other customers from accessing the invoice', async () => {
		const { invoice } = await createOrderAndInvoice()

		// Create another user who should NOT have access
		const otherUser = await prisma.user.create({
			data: {
				email: `other-cust-pdf-${Date.now()}@example.com`,
				username: `other-cust-pdf-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			otherUser.id,
			`https://example.com/account/invoices/${invoice.id}.pdf`,
		)

		await expect(
			loader({
				params: { invoiceId: invoice.id },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('guest order accessible with correct email parameter', async () => {
		const { invoice } = await createOrderAndInvoice({
			userId: null,
			email: 'guest@example.com',
		})

		const request = await createAuthRequest(
			customerUserId,
			`https://example.com/account/invoices/${invoice.id}.pdf?email=guest@example.com`,
		)

		const response = await loader({
			params: { invoiceId: invoice.id },
			request,
		} as any)

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
	})

	test('guest order blocked with wrong email parameter', async () => {
		const { invoice } = await createOrderAndInvoice({
			userId: null,
			email: 'guest@example.com',
		})

		const request = await createAuthRequest(
			customerUserId,
			`https://example.com/account/invoices/${invoice.id}.pdf?email=wrong@example.com`,
		)

		await expect(
			loader({
				params: { invoiceId: invoice.id },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('guest order requires email parameter', async () => {
		const { invoice } = await createOrderAndInvoice({
			userId: null,
			email: 'guest@example.com',
		})

		const request = await createAuthRequest(
			customerUserId,
			`https://example.com/account/invoices/${invoice.id}.pdf`,
		)

		await expect(
			loader({
				params: { invoiceId: invoice.id },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('unauthenticated users are redirected to login', async () => {
		const { invoice } = await createOrderAndInvoice()

		const request = new Request(
			`https://example.com/account/invoices/${invoice.id}.pdf`,
			{ method: 'GET' },
		)

		// requireUserId throws redirect to /login for unauthenticated users
		await expect(
			loader({
				params: { invoiceId: invoice.id },
				request,
			} as any),
		).rejects.toThrow()
	})
})
