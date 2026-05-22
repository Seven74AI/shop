/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import { loader } from './$orderNumber.invoice.pdf.ts'

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

describe('admin invoice PDF download', () => {
	let adminUser: Awaited<ReturnType<typeof prisma.user.create>>

	beforeEach(async () => {
		adminUser = await prisma.user.create({
			data: {
				email: `admin-pdf-${Date.now()}@example.com`,
				username: `admin-pdf-${Date.now()}`,
			},
		})

		// Create admin role and assign to user
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		await prisma.user.update({
			where: { id: adminUser.id },
			data: {
				roles: {
					connect: { id: adminRole.id },
				},
			},
		})

		consoleError.mockImplementation(() => {})
	})

	afterEach(async () => {
		await prisma.invoice.deleteMany({})
		await prisma.session.deleteMany({})
		await prisma.orderItem.deleteMany({})
		await prisma.order.deleteMany({})
		await prisma.user.deleteMany({})
		consoleError.mockClear()
		vi.clearAllMocks()
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

	let _invoiceSeq = 1
	async function createOrderAndInvoice() {
		const seq = _invoiceSeq++
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-ADMIN-PDF-${Date.now()}-${seq}`,
				email: 'customer@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'Test Customer',
				shippingStreet: '123 Main St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_admin_pdf_${Date.now()}-${seq}`,
				status: 'CONFIRMED',
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: seq,
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
				issuedAt: new Date('2025-08-01'),
			},
		})

		return { order, invoice }
	}

	test('returns PDF with correct content-type for order with invoice', async () => {
		const { order, invoice } = await createOrderAndInvoice()
		const expectedNumber = `F${invoice.fiscalYear}-${String(invoice.sequence).padStart(5, '0')}`

		const request = await createAuthRequest(
			adminUser.id,
			`http://localhost/admin/orders/${order.orderNumber}/invoice.pdf`,
		)

		const response = await loader({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		expect(response).toBeInstanceOf(Response)
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
		expect(response.headers.get('Content-Disposition')).toContain(
			`invoice-${expectedNumber}.pdf`,
		)
		expect(response.headers.get('Content-Disposition')).toContain('attachment')
	})

	test('returns 404 for order with no invoice', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-NO-INV-${Date.now()}`,
				email: 'customer@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test',
				shippingStreet: 'Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 0,
				stripeCheckoutSessionId: `cs_no_inv_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const request = await createAuthRequest(
			adminUser.id,
			`http://localhost/admin/orders/${order.orderNumber}/invoice.pdf`,
		)

		await expect(
			loader({
				params: { orderNumber: order.orderNumber },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('returns 404 for non-existent order', async () => {
		const request = await createAuthRequest(
			adminUser.id,
			'http://localhost/admin/orders/FAKE-ORDER-123/invoice.pdf',
		)

		await expect(
			loader({
				params: { orderNumber: 'FAKE-ORDER-123' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('returns PDF for invoice specified by invoiceId query param', async () => {
		const { order, invoice } = await createOrderAndInvoice()

		const request = await createAuthRequest(
			adminUser.id,
			`http://localhost/admin/orders/${order.orderNumber}/invoice.pdf?invoiceId=${invoice.id}`,
		)

		const response = await loader({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
	})

	test('returns 400 when invoiceId does not belong to the order', async () => {
		const { order: order1 } = await createOrderAndInvoice()
		const { invoice: invoice2 } = await createOrderAndInvoice()

		const request = await createAuthRequest(
			adminUser.id,
			`http://localhost/admin/orders/${order1.orderNumber}/invoice.pdf?invoiceId=${invoice2.id}`,
		)

		await expect(
			loader({
				params: { orderNumber: order1.orderNumber },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('blocks non-admin users (authenticated but without admin role)', async () => {
		const { order } = await createOrderAndInvoice()

		// Create a regular user without admin role
		const regularUser = await prisma.user.create({
			data: {
				email: `regular-pdf-${Date.now()}@example.com`,
				username: `regular-pdf-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			`http://localhost/admin/orders/${order.orderNumber}/invoice.pdf`,
		)

		// requireUserWithRole will throw since user doesn't have admin role
		await expect(
			loader({
				params: { orderNumber: order.orderNumber },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('credit note PDF download via invoiceId', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-CN-PDF-${Date.now()}`,
				email: 'customer@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'Test',
				shippingStreet: 'Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_cn_pdf_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const parentInvoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 99,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 15000,
				totalCents: 18000,
				vatTotalCents: 3000,
				vatBreakdown: [{ kind: 'STANDARD', rate: 2000, baseCents: 15000, vatCents: 3000 }],
				status: 'FINAL',
			},
		})

		const creditNote = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 100,
				kind: 'CREDIT_NOTE',
				orderId: order.id,
				parentInvoiceId: parentInvoice.id,
				subtotalCents: 0,
				totalCents: 0,
				vatTotalCents: 0,
				vatBreakdown: [],
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUser.id,
			`http://localhost/admin/orders/${order.orderNumber}/invoice.pdf?invoiceId=${creditNote.id}`,
		)

		const response = await loader({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
		expect(response.headers.get('Content-Disposition')).toContain('credit-note')
	})
})
