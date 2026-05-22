/**
 * API Resource Route: GET /api/invoices/:id
 *
 * Returns a single invoice as JSON with full details.
 * Admin-only access via cookie auth.
 */
import { invariantResponse } from '@epic-web/invariant'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatInvoiceNumber } from '#app/utils/invoice.server.ts'
import { type Route } from './+types/$id.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { id } = params

	const invoice = await prisma.invoice.findUnique({
		where: { id },
		include: {
			order: {
				select: {
					id: true,
					orderNumber: true,
					email: true,
					shippingName: true,
					shippingStreet: true,
					shippingCity: true,
					shippingPostal: true,
					shippingCountry: true,
					createdAt: true,
					subtotal: true,
					total: true,
					shippingCost: true,
					taxCountry: true,
					customerVatNumber: true,
					user: {
						select: {
							id: true,
							email: true,
							name: true,
						},
					},
				},
			},
			parentInvoice: {
				select: {
					id: true,
					fiscalYear: true,
					sequence: true,
				},
			},
			creditNotes: {
				select: {
					id: true,
					fiscalYear: true,
					sequence: true,
					kind: true,
					totalCents: true,
					status: true,
				},
			},
		},
	})

	invariantResponse(invoice, 'Invoice not found', { status: 404 })

	const vatBreakdown = (
		Array.isArray(invoice.vatBreakdown) ? invoice.vatBreakdown : []
	) as Array<{
		kind: string
		rate: number
		baseCents: number
		vatCents: number
	}>

	const invoiceNumber = formatInvoiceNumber(invoice.fiscalYear, invoice.sequence)

	return {
		invoice: {
			id: invoice.id,
			invoiceNumber,
			fiscalYear: invoice.fiscalYear,
			sequence: invoice.sequence,
			kind: invoice.kind,
			status: invoice.status,
			subtotalCents: invoice.subtotalCents,
			totalCents: invoice.totalCents,
			vatTotalCents: invoice.vatTotalCents,
			vatBreakdown,
			parentInvoiceId: invoice.parentInvoiceId,
			parentInvoiceNumber: invoice.parentInvoice
				? formatInvoiceNumber(
						invoice.parentInvoice.fiscalYear,
						invoice.parentInvoice.sequence,
					)
				: null,
			creditNotes: invoice.creditNotes.map((cn) => ({
				id: cn.id,
				invoiceNumber: formatInvoiceNumber(cn.fiscalYear, cn.sequence),
				kind: cn.kind,
				totalCents: cn.totalCents,
				status: cn.status,
			})),
			issuedAt: invoice.issuedAt?.toISOString() ?? null,
			createdAt: invoice.createdAt.toISOString(),
			updatedAt: invoice.updatedAt.toISOString(),
			order: {
				id: invoice.order.id,
				orderNumber: invoice.order.orderNumber,
				email: invoice.order.email,
				shippingName: invoice.order.shippingName,
				shippingStreet: invoice.order.shippingStreet,
				shippingCity: invoice.order.shippingCity,
				shippingPostal: invoice.order.shippingPostal,
				shippingCountry: invoice.order.shippingCountry,
				customerVatNumber: invoice.order.customerVatNumber,
				taxCountry: invoice.order.taxCountry,
				subtotalCents: invoice.order.subtotal,
				totalCents: invoice.order.total,
				shippingCostCents: invoice.order.shippingCost,
				createdAt: invoice.order.createdAt.toISOString(),
				customer: invoice.order.user
					? {
							id: invoice.order.user.id,
							email: invoice.order.user.email,
							name: invoice.order.user.name,
						}
					: null,
			},
		},
	}
}
