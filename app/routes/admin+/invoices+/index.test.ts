/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './index.tsx'

describe('admin invoices list', () => {
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `admin-list-${Date.now()}@example.com`,
				username: `admin-list-${Date.now()}`,
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

	test('returns empty list when no invoices exist', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/invoices',
		)

		const result = await loader({ request } as any)
		expect(result).toHaveProperty('invoices')
		expect(result.invoices).toEqual([])
		expect(result).toHaveProperty('currency')
	})

	test('returns all invoices sorted by newest first', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-LIST-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				stripeCheckoutSessionId: `cs_list_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		// Create invoices with different timestamps
		const inv1 = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 1,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 10000,
				totalCents: 12000,
				vatTotalCents: 2000,
				status: 'DRAFT',
			},
		})

		const inv2 = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 2,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 5000,
				totalCents: 6000,
				vatTotalCents: 1000,
				status: 'FINAL',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/invoices',
		)

		const result = await loader({ request } as any)

		expect(result.invoices).toHaveLength(2)
		// Most recent first
		expect(result.invoices[0]!.id).toBe(inv2.id)
		expect(result.invoices[1]!.id).toBe(inv1.id)

		// Verify each invoice has order data
		result.invoices.forEach((inv: any) => {
			expect(inv.order).toBeTruthy()
			expect(inv.order.orderNumber).toBe(order.orderNumber)
		})
	})

	test('blocks non-admin users', async () => {
		const regularUser = await prisma.user.create({
			data: {
				email: `regular-list-${Date.now()}@example.com`,
				username: `regular-list-${Date.now()}`,
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/admin/invoices',
		)

		await expect(loader({ request } as any)).rejects.toThrow()
	})
})
