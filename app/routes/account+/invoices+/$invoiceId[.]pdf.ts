/**
 * Customer Resource Route: Download Invoice PDF
 *
 * Generates and streams a PDF invoice for download.
 * Customer access — requires authentication and ownership verification.
 * Uses @react-pdf/renderer for server-side PDF generation.
 */

import { invariantResponse } from '@epic-web/invariant'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatInvoiceNumber } from '#app/utils/invoice.server.ts'
import {
	generateInvoicePdfStream,
	type InvoicePdfData,
} from '#app/utils/invoice-pdf.server.tsx'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$invoiceId[.]pdf.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const { invoiceId } = params
	const url = new URL(request.url)
	const email = url.searchParams.get('email')

	const invoice = await prisma.invoice.findUnique({
		where: { id: invoiceId },
		include: {
			order: {
				select: {
					userId: true,
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

	// Authorization: verify the invoice belongs to this customer
	if (invoice.order.userId) {
		// Order belongs to a registered user — must match
		invariantResponse(
			userId === invoice.order.userId,
			'Unauthorized',
			{ status: 403 },
		)
	} else {
		// Guest order — require email verification
		invariantResponse(email, 'Email required to download guest invoice', {
			status: 400,
		})
		invariantResponse(
			email.toLowerCase() === invoice.order.email.toLowerCase(),
			'Email does not match invoice order',
			{ status: 403 },
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

	// Return the PDF as a response with appropriate headers
	return new Response(pdfStream as unknown as BodyInit, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${prefix}-${num}.pdf"`,
			'Cache-Control': 'no-cache',
		},
	})
}
