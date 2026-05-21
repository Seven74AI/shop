/**
 * Admin Action: Create Invoice for Order
 *
 * Generates a sequential fiscal-year invoice number using the Promise-chain lock
 * and creates an Invoice record linked to the order. Supports idempotency — if an
 * invoice already exists for the order, returns the existing invoice.
 */

import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'
import {
	generateInvoiceNumber,
	withInvoiceLock,
	formatInvoiceNumber,
} from '#app/utils/invoice.server.ts'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$orderNumber.create-invoice.ts'

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params
	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	// Validate that order can be invoiced
	if (order.status === 'CANCELLED') {
		return data(
			{
				error: 'Cannot invoice cancelled order',
				message: `Order ${order.orderNumber} is cancelled and cannot be invoiced.`,
			},
			{ status: 400 },
		)
	}

	// Check if an invoice already exists for this order (idempotency)
	const existingInvoice = await prisma.invoice.findFirst({
		where: { orderId: order.id, kind: 'INVOICE' },
	})
	if (existingInvoice) {
		const num = formatInvoiceNumber(
			existingInvoice.fiscalYear,
			existingInvoice.sequence,
		)
		return data({
			success: true,
			message: `Invoice ${num} already exists for this order.`,
			invoice: {
				id: existingInvoice.id,
				number: num,
				fiscalYear: existingInvoice.fiscalYear,
				sequence: existingInvoice.sequence,
				status: existingInvoice.status,
				subtotalCents: existingInvoice.subtotalCents,
				totalCents: existingInvoice.totalCents,
				vatTotalCents: existingInvoice.vatTotalCents,
			},
		})
	}

	// Determine fiscal year from current date
	const fiscalYear = new Date().getFullYear()

	try {
		const result = await withInvoiceLock(async () => {
			const invoiceNumber = await generateInvoiceNumber(fiscalYear!)

			// Extract sequence from the generated number
			const match = invoiceNumber.match(/^F\d{4}-(\d{5})$/)
			if (!match) {
				throw new Error(`Invalid generated invoice number: ${invoiceNumber}`)
			}
			const sequence = parseInt(match[1]!, 10)

			// Build VAT breakdown from order data (snapshot at invoice time)
			// If order has VAT info, use it; otherwise create a simple breakdown
			const vatBreakdown: Array<{
				kind: string
				rate: number
				baseCents: number
				vatCents: number
			}> = []

			// VAT snapshot: if order was placed with VAT applied, compute it here.
			// For now, we store the order's subtotal=baseCents and total-subtotal=vatCents
			// as a single "STANDARD" rate breakdown when VAT is present.
			const vatCents = order.total - order.subtotal
			if (vatCents > 0) {
				// Approximate rate from the totals (rate in basis points)
				const rate = Math.round((vatCents / order.subtotal) * 10000)
				vatBreakdown.push({
					kind: 'STANDARD',
					rate,
					baseCents: order.subtotal,
					vatCents,
				})
			} else if (vatCents < 0) {
				vatBreakdown.push({
					kind: 'STANDARD',
					rate: 0,
					baseCents: order.subtotal,
					vatCents: 0,
				})
			}

			const invoice = await prisma.invoice.create({
				data: {
					fiscalYear,
					sequence,
					kind: 'INVOICE',
					orderId: order.id,
					subtotalCents: order.subtotal,
					totalCents: order.total,
					vatBreakdown,
					vatTotalCents: vatCents > 0 ? vatCents : 0,
					status: 'DRAFT',
				},
			})

			return {
				invoice,
				number: invoiceNumber,
			}
		})

		return data({
			success: true,
			message: `Invoice ${result.number} created successfully.`,
			invoice: {
				id: result.invoice.id,
				number: result.number,
				fiscalYear: result.invoice.fiscalYear,
				sequence: result.invoice.sequence,
				status: result.invoice.status,
				subtotalCents: result.invoice.subtotalCents,
				totalCents: result.invoice.totalCents,
				vatTotalCents: result.invoice.vatTotalCents,
			},
		})
	} catch (error) {
		console.error('Failed to create invoice:', error)
		return data(
			{
				error: 'Failed to create invoice',
				message:
					error instanceof Error
						? error.message
						: 'An unknown error occurred while creating the invoice',
			},
			{ status: 500 },
		)
	}
}
