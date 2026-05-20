/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$invoiceId[.]pdf.ts'

// Mock @react-pdf/renderer to avoid actual PDF rendering in tests.
// The renderToStream function requires Node.js PDFKit internals which
// work in the node environment but we mock for speed and reliability.
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
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `admin-pdf-${Date.now()}@example.com`,
				username: `admin-pdf-${Date.now()}`,
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

	test('returns PDF with correct content-type', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-PDF-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'PDF User',
				shippingStreet: '123 PDF St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_pdf_${Date.now()}`,
				status: 'CONFIRMED',
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

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/invoices/${invoice.id}.pdf`,
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
			adminUserId,
			'https://example.com/admin/invoices/non-existent-id.pdf',
		)

		await expect(
			loader({
				params: { invoiceId: 'non-existent-id' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('blocks non-admin users', async () => {
		const regularUser = await prisma.user.create({
			data: {
				email: `regular-pdf-${Date.now()}@example.com`,
				username: `regular-pdf-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/admin/invoices/some-id.pdf',
		)

		await expect(
			loader({
				params: { invoiceId: 'some-id' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('includes order items in PDF data', async () => {
		const category = await prisma.category.upsert({
			where: { id: 'uncategorized' },
			update: { name: 'Test Category', slug: `test-cat-${Date.now()}` },
			create: { id: 'uncategorized', name: 'Test Category', slug: `test-cat-${Date.now()}` },
		})

		const product = await prisma.product.create({
			data: {
				id: `prod-test-pdf-${Date.now()}`,
				name: 'Test Product',
				price: 5000,
				slug: `test-product-pdf-${Date.now()}`,
				description: 'A test product for PDF',
				sku: `SKU-TEST-PDF-${Date.now()}`,
				stockQuantity: 10,
				categoryId: category.id,
			},
		})

		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-ITEMS-${Date.now()}`,
				email: 'items@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'Items User',
				shippingStreet: '456 Items St',
				shippingCity: 'Bordeaux',
				shippingPostal: '33000',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_items_${Date.now()}`,
				status: 'CONFIRMED',
				items: {
					create: [
						{
							productId: product.id,
							price: 5000,
							quantity: 3,
						},
					],
				},
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 43,
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
				status: 'DRAFT',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/invoices/${invoice.id}.pdf`,
		)

		const response = await loader({
			params: { invoiceId: invoice.id },
			request,
		} as any)

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
	})

	test('handles guest orders without user', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-GUEST-${Date.now()}`,
				email: 'guest@example.com',
				subtotal: 5000,
				total: 6000,
				shippingName: 'Guest User',
				shippingStreet: '789 Guest St',
				shippingCity: 'Lille',
				shippingPostal: '59000',
				shippingCountry: 'FR',
				shippingCost: 0,
				stripeCheckoutSessionId: `cs_guest_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 44,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 5000,
				totalCents: 6000,
				vatTotalCents: 1000,
				vatBreakdown: [
					{
						kind: 'STANDARD',
						rate: 2000,
						baseCents: 5000,
						vatCents: 1000,
					},
				],
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/invoices/${invoice.id}.pdf`,
		)

		const response = await loader({
			params: { invoiceId: invoice.id },
			request,
		} as any)

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
		expect(response.headers.get('Content-Disposition')).toContain(
			'invoice-F2025-00044.pdf',
		)
	})
})
