/**
 * Admin Resource Route: Download Invoice PDF
 *
 * Generates and streams a PDF invoice for download.
 * Admin-only access. Uses @react-pdf/renderer for server-side PDF generation.
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
import { type Route } from './+types/$invoiceId.pdf.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { invoiceId } = params

	const invoice = await prisma.invoice.findUnique({
		where: { id: invoiceId },
		include: {
			order: {
				select: {
					orderNumber: true,
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

	invariantResponse(invoice, 'Invoice not found', { status: 404 })

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
			invoice.issuedAt?.toISOString().split('T')[0] ??
			invoice.createdAt.toISOString().split('T')[0],
		invoiceStatus: invoice.status,
		orderNumber: invoice.order.orderNumber,
		orderDate: invoice.order.createdAt.toISOString().split('T')[0],
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
		currency,
		storeName: 'Epic Shop',
		storeAddress: '123 Epic Street, 75001 Paris, France',
		storeVatNumber: 'FR12345678901',
		storeEmail: 'contact@epicshop.example.com',
	}

	const pdfStream = await generateInvoicePdfStream(pdfData)

	const num = pdfData.invoiceNumber

	// Return the PDF as a response with appropriate headers
	return new Response(pdfStream as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="invoice-${num}.pdf"`,
			'Cache-Control': 'no-cache',
		},
	})
}
