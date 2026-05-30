/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$id[.]pdf.ts'

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

describe('GET /api/invoices/:id.pdf', () => {
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `api-pdf-${Date.now()}@example.com`,
				username: `api-pdf-${Date.now()}`,
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

	test('returns PDF response with correct headers', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-PDF-API-${Date.now()}`,
				email: 'pdf-api@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'PDF User',
				shippingStreet: '123 PDF St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_pdf_api_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 5,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 15000,
				totalCents: 18000,
				vatTotalCents: 3000,
				status: 'FINAL',
				issuedAt: new Date('2025-06-15'),
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/api/invoices/${invoice.id}.pdf`,
		)

		const response = await loader({
			params: { id: invoice.id },
			request,
		} as any)

		expect(response).toBeInstanceOf(Response)
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/pdf')
		expect(response.headers.get('Content-Disposition')).toContain(
			'invoice-F2025-00005.pdf',
		)
	})

	test('returns 404 for non-existent invoice', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices/non-existent.pdf',
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
				email: `api-pdf-regular-${Date.now()}@example.com`,
				username: `api-pdf-regular-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/api/invoices/some-id.pdf',
		)

		await expect(
			loader({
				params: { id: 'some-id' },
				request,
			} as any),
		).rejects.toThrow()
	})
})
