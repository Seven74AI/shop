/**
 * Admin Resource Route: Download Invoice PDF
 *
 * Generates and streams a PDF invoice for download by admin users.
 * Admin access only — requires authentication with 'admin' role.
 * Uses @react-pdf/renderer for server-side PDF generation.
 */

import { invariantResponse } from '@epic-web/invariant'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatInvoiceNumber } from '#app/utils/invoice.server.ts'
import {
	generateInvoicePdfStream,
	type InvoicePdfData,
} from '#app/utils/invoice-pdf.server.tsx'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$orderNumber.invoice.pdf.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params
	const url = new URL(request.url)
	const invoiceId = url.searchParams.get('invoiceId')

	// If invoiceId is provided, fetch that specific invoice
	const invoice = invoiceId
		? await prisma.invoice.findUnique({
				where: { id: invoiceId },
				include: {
					order: {
						select: {
							orderNumber: true,
							userId: true,
							email: true,
							subtotal: true,
							total: true,
							shippingCost: true,
							shippingName: true,
							shippingStreet: true,
							shippingCity: true,
							shippingPostal: true,
							shippingCountry: true,
							createdAt: true,
							taxCountry: true,
							customerVatNumber: true,
							user: {
								select: {
									id: true,
									email: true,
									name: true,
								},
							},
							items: {
								include: {
									product: {
										select: { name: true },
									},
									variant: {
										select: { sku: true },
									},
								},
							},
						},
					},
				},
			})
		: await prisma.invoice.findFirst({
				where: {
					order: { orderNumber },
					kind: 'INVOICE',
				},
				orderBy: { createdAt: 'desc' },
				include: {
					order: {
						select: {
							orderNumber: true,
							userId: true,
							email: true,
							subtotal: true,
							total: true,
							shippingCost: true,
							shippingName: true,
							shippingStreet: true,
							shippingCity: true,
							shippingPostal: true,
							shippingCountry: true,
							createdAt: true,
							taxCountry: true,
							customerVatNumber: true,
							user: {
								select: {
									id: true,
									email: true,
									name: true,
								},
							},
							items: {
								include: {
									product: {
										select: { name: true },
									},
									variant: {
										select: { sku: true },
									},
								},
							},
						},
					},
				},
			})

	invariantResponse(invoice, 'No invoice found for this order', { status: 404 })

	// Verify invoice belongs to the requested order (when using invoiceId)
	if (invoiceId && invoice.order.orderNumber !== orderNumber) {
		invariantResponse(
			false,
			'Invoice does not belong to this order',
			{ status: 400 },
		)
	}

	const currency = await getStoreCurrency()

	// Build item rows for the PDF table
	const itemRows: InvoicePdfData['items'] = invoice.order.items.map(
		(item) => {
			const productName = item.product?.name ?? 'Product'
			const variantSku = item.variant?.sku
			const description = variantSku
				? `${productName} (${variantSku})`
				: productName
			return {
				description,
				quantity: item.quantity,
				unitPriceCents: item.price,
				totalCents: item.price * item.quantity,
			}
		},
	)

	// Build VAT breakdown
	const vatBreakdown = (
		Array.isArray(invoice.vatBreakdown) ? invoice.vatBreakdown : []
	) as Array<{
		kind: string
		rate: number
		baseCents: number
		vatCents: number
	}>

	// Customer info
	const customerName =
		invoice.order.user?.name || invoice.order.shippingName || 'Guest'
	const customerEmail =
		invoice.order.user?.email || invoice.order.email || ''

	const pdfData: InvoicePdfData = {
		invoiceNumber: formatInvoiceNumber(
			invoice.fiscalYear,
			invoice.sequence,
		),
		invoiceDate:
			invoice.issuedAt?.toISOString()?.slice(0, 10) ??
			invoice.createdAt.toISOString().slice(0, 10),
		invoiceStatus: invoice.status,
		orderNumber: invoice.order.orderNumber,
		orderDate: invoice.order.createdAt.toISOString().slice(0, 10),
		kind: invoice.kind,
		customer: {
			name: customerName,
			email: customerEmail,
			company: null,
			vatNumber: invoice.order.customerVatNumber ?? null,
		},
		shipping: {
			name: invoice.order.shippingName,
			street: invoice.order.shippingStreet,
			city: invoice.order.shippingCity,
			postal: invoice.order.shippingPostal,
			country: invoice.order.shippingCountry,
		},
		items: itemRows,
		subtotalCents: invoice.subtotalCents,
		vatBreakdown,
		vatTotalCents: invoice.vatTotalCents,
		shippingCostCents: invoice.order.shippingCost,
		totalCents: invoice.totalCents,
		currency: currency ?? null,
		storeName: 'Epic Shop',
		storeAddress: '123 Epic Street, 75001 Paris, France',
		storeVatNumber: 'FR12345678901',
		storeEmail: 'contact@epicshop.example.com',
	}

	const pdfStream = await generateInvoicePdfStream(pdfData)

	const num = pdfData.invoiceNumber
	const prefix = invoice.kind === 'CREDIT_NOTE' ? 'credit-note' : 'invoice'

	return new Response(pdfStream as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${prefix}-${num}.pdf"`,
			'Cache-Control': 'no-cache',
		},
	})
}
