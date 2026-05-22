/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './index.ts'

describe('GET /api/invoices', () => {
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `api-invoice-list-${Date.now()}@example.com`,
				username: `api-invoice-list-${Date.now()}`,
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

	test('returns paginated list of invoices as JSON', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-LIST-${Date.now()}`,
				email: 'list-test@example.com',
				subtotal: 15000,
				total: 18000,
				shippingName: 'List User',
				shippingStreet: '123 List St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_list_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 1,
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
			'https://example.com/api/invoices',
		)

		const response = await loader({ request } as any)

		expect(response).toHaveProperty('data')
		expect(response).toHaveProperty('pagination')
		const { data, pagination } = response as any
		expect(Array.isArray(data)).toBe(true)
		expect(data.length).toBe(1)
		expect(pagination.page).toBe(1)
		expect(pagination.limit).toBe(20)
		expect(pagination.total).toBe(1)
		expect(pagination.totalPages).toBe(1)

		// Verify invoice data shape
		const invoice = data[0]
		expect(invoice).toHaveProperty('id')
		expect(invoice.invoiceNumber).toBe('F2025-00001')
		expect(invoice.fiscalYear).toBe(2025)
		expect(invoice.sequence).toBe(1)
		expect(invoice.kind).toBe('INVOICE')
		expect(invoice.status).toBe('FINAL')
		expect(invoice.subtotalCents).toBe(15000)
		expect(invoice.totalCents).toBe(18000)
		expect(invoice.vatTotalCents).toBe(3000)
		expect(invoice.issuedAt).toBe('2025-06-15T00:00:00.000Z')
		expect(invoice.order).toBeTruthy()
		expect(invoice.order.orderNumber).toBe(order.orderNumber)
	})

	test('filters invoices by status', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-STATUS-${Date.now()}`,
				email: 'status-test@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Status User',
				shippingStreet: '456 Status St',
				shippingCity: 'Lyon',
				shippingPostal: '69001',
				shippingCountry: 'FR',
				shippingCost: 300,
				stripeCheckoutSessionId: `cs_status_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		// Create a DRAFT and a FINAL invoice
		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 10,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 10000,
				totalCents: 12000,
				vatTotalCents: 2000,
				status: 'DRAFT',
			},
		})
		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 11,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 10000,
				totalCents: 12000,
				vatTotalCents: 2000,
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices?status=DRAFT',
		)

		const response = await loader({ request } as any)

		const { data, pagination } = response as any
		expect(data.length).toBe(1)
		expect(data[0].status).toBe('DRAFT')
		expect(pagination.total).toBe(1)
	})

	test('filters invoices by kind', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-KIND-${Date.now()}`,
				email: 'kind-test@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Kind User',
				shippingStreet: '789 Kind St',
				shippingCity: 'Marseille',
				shippingPostal: '13001',
				shippingCountry: 'FR',
				shippingCost: 300,
				stripeCheckoutSessionId: `cs_kind_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 20,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 5000,
				totalCents: 6000,
				vatTotalCents: 1000,
				status: 'FINAL',
			},
		})
		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 21,
				kind: 'CREDIT_NOTE',
				orderId: order.id,
				subtotalCents: -2500,
				totalCents: -3000,
				vatTotalCents: -500,
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices?kind=CREDIT_NOTE',
		)

		const response = await loader({ request } as any)

		const { data } = response as any
		expect(data.length).toBe(1)
		expect(data[0].kind).toBe('CREDIT_NOTE')
	})

	test('filters invoices by fiscalYear', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-FY-${Date.now()}`,
				email: 'fy-test@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'FY User',
				shippingStreet: '101 FY St',
				shippingCity: 'Bordeaux',
				shippingPostal: '33000',
				shippingCountry: 'FR',
				shippingCost: 300,
				stripeCheckoutSessionId: `cs_fy_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		await prisma.invoice.create({
			data: {
				fiscalYear: 2024,
				sequence: 1,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 5000,
				totalCents: 6000,
				vatTotalCents: 1000,
				status: 'FINAL',
			},
		})
		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 1,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 8000,
				totalCents: 9600,
				vatTotalCents: 1600,
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices?fiscalYear=2025',
		)

		const response = await loader({ request } as any)

		const { data } = response as any
		expect(data.length).toBe(1)
		expect(data[0].fiscalYear).toBe(2025)
	})

	test('filters invoices by orderId', async () => {
		const order1 = await prisma.order.create({
			data: {
				orderNumber: `ORD-FILTER1-${Date.now()}`,
				email: 'filter1@example.com',
				subtotal: 5000,
				total: 6000,
				shippingName: 'Filter1 User',
				shippingStreet: '1 A St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 300,
				stripeCheckoutSessionId: `cs_filter1_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})
		const order2 = await prisma.order.create({
			data: {
				orderNumber: `ORD-FILTER2-${Date.now()}`,
				email: 'filter2@example.com',
				subtotal: 8000,
				total: 9600,
				shippingName: 'Filter2 User',
				shippingStreet: '2 B St',
				shippingCity: 'Lyon',
				shippingPostal: '69001',
				shippingCountry: 'FR',
				shippingCost: 400,
				stripeCheckoutSessionId: `cs_filter2_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 30,
				kind: 'INVOICE',
				orderId: order1.id,
				subtotalCents: 5000,
				totalCents: 6000,
				vatTotalCents: 1000,
				status: 'FINAL',
			},
		})
		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 31,
				kind: 'INVOICE',
				orderId: order2.id,
				subtotalCents: 8000,
				totalCents: 9600,
				vatTotalCents: 1600,
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			`https://example.com/api/invoices?orderId=${order2.id}`,
		)

		const response = await loader({ request } as any)

		const { data } = response as any
		expect(data.length).toBe(1)
		expect(data[0].order.id).toBe(order2.id)
	})

	test('supports pagination with page and limit params', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-PAGE-${Date.now()}`,
				email: 'page-test@example.com',
				subtotal: 5000,
				total: 6000,
				shippingName: 'Page User',
				shippingStreet: '202 Page St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 300,
				stripeCheckoutSessionId: `cs_page_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		// Create 5 invoices on same order
		for (let i = 0; i < 5; i++) {
			// Need unique (fiscalYear, sequence) per invoice
			await prisma.invoice.create({
				data: {
					fiscalYear: 2025,
					sequence: 40 + i,
					kind: 'INVOICE',
					orderId: order.id,
					subtotalCents: 5000,
					totalCents: 6000,
					vatTotalCents: 1000,
					status: 'FINAL',
				},
			})
		}

		// Page 1, limit 2
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices?page=1&limit=2',
		)

		const response = await loader({ request } as any)

		const { data, pagination } = response as any
		expect(data.length).toBe(2)
		expect(pagination.page).toBe(1)
		expect(pagination.limit).toBe(2)
		expect(pagination.total).toBe(5)
		expect(pagination.totalPages).toBe(3)
	})

	test('returns empty array when no invoices exist', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices',
		)

		const response = await loader({ request } as any)

		const { data, pagination } = response as any
		expect(Array.isArray(data)).toBe(true)
		expect(data.length).toBe(0)
		expect(pagination.total).toBe(0)
		expect(pagination.totalPages).toBe(0)
	})

	test('blocks non-admin users', async () => {
		const regularUser = await prisma.user.create({
			data: {
				email: `api-list-regular-${Date.now()}@example.com`,
				username: `api-list-regular-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/api/invoices',
		)

		await expect(
			loader({ request } as any),
		).rejects.toThrow()
	})

	test('sanitizes invalid page/limit params', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/api/invoices?page=0&limit=999',
		)

		const response = await loader({ request } as any)

		const { pagination } = response as any
		// Page 0 should be clamped to 1, limit > 100 clamped to 100
		expect(pagination.page).toBe(1)
		expect(pagination.limit).toBe(100)
	})
})
