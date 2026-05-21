/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$invoiceId.tsx'

describe('admin invoice detail', () => {
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `admin-detail-${Date.now()}@example.com`,
				username: `admin-detail-${Date.now()}`,
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

	test('returns invoice with order details', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-DETAIL-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'Detail User',
				shippingStreet: '456 Detail St',
				shippingCity: 'Lyon',
				shippingPostal: '69001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_detail_${Date.now()}`,
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
					{ kind: 'STANDARD', rate: 2000, baseCents: 15000, vatCents: 3000 },
				],
				status: 'FINAL',
				issuedAt: new Date('2025-06-15'),
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/invoices/${invoice.id}`,
		)

		const result = await loader({
			params: { invoiceId: invoice.id },
			request,
		} as any)

		expect(result).toHaveProperty('invoice')
		expect(result).toHaveProperty('currency')
		expect(result.invoice.id).toBe(invoice.id)
		expect(result.invoice.fiscalYear).toBe(2025)
		expect(result.invoice.sequence).toBe(42)
		expect(result.invoice.status).toBe('FINAL')
		expect(result.invoice.subtotalCents).toBe(15000)
		expect(result.invoice.totalCents).toBe(18000)
		expect(result.invoice.vatTotalCents).toBe(3000)
		expect(result.invoice.order).toBeTruthy()
		expect(result.invoice.order.orderNumber).toBe(order.orderNumber)
		expect(result.invoice.order.shippingName).toBe('Detail User')
		expect(result.invoice.order.shippingCity).toBe('Lyon')
	})

	test('returns 404 for non-existent invoice', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/invoices/non-existent-id',
		)

		await expect(
			loader({
				params: { invoiceId: 'non-existent-id' },
				request,
			} as any),
		).rejects.toThrow()
	})

	test('includes parent invoice and credit notes when present', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-CREDIT-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Credit User',
				shippingStreet: '789 Credit St',
				shippingCity: 'Marseille',
				shippingPostal: '13001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_credit_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const originalInvoice = await prisma.invoice.create({
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
				parentInvoiceId: originalInvoice.id,
				subtotalCents: -5000,
				totalCents: -6000,
				vatTotalCents: -1000,
				status: 'FINAL',
			},
		})

		// Check original invoice sees its credit notes
		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/invoices/${originalInvoice.id}`,
		)

		const result = await loader({
			params: { invoiceId: originalInvoice.id },
			request,
		} as any)

		expect(result.invoice.creditNotes).toHaveLength(1)
		expect(result.invoice.creditNotes[0].id).toBe(creditNote.id)
		expect(result.invoice.creditNotes[0].kind).toBe('CREDIT_NOTE')

		// Check credit note references parent
		const request2 = await createAuthRequest(
			adminUserId,
			`https://example.com/admin/invoices/${creditNote.id}`,
		)

		const result2 = await loader({
			params: { invoiceId: creditNote.id },
			request: request2,
		} as any)

		expect(result2.invoice.parentInvoice).toBeTruthy()
		expect(result2.invoice.parentInvoice.id).toBe(originalInvoice.id)
		expect(result2.invoice.kind).toBe('CREDIT_NOTE')
	})

	test('blocks non-admin users', async () => {
		const regularUser = await prisma.user.create({
			data: {
				email: `regular-detail-${Date.now()}@example.com`,
				username: `regular-detail-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/admin/invoices/some-id',
		)

		await expect(
			loader({
				params: { invoiceId: 'some-id' },
				request,
			} as any),
		).rejects.toThrow()
	})
})
