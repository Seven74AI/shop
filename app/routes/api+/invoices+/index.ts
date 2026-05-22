/**
 * API Resource Route: GET /api/invoices
 *
 * Returns a paginated, filterable JSON list of invoices.
 * Admin-only access via cookie auth.
 */

import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatInvoiceNumber } from '#app/utils/invoice.server.ts'
import { type Route } from './+types/index.ts'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE)
	const limit = Math.min(
		MAX_LIMIT,
		Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
	)
	const skip = (page - 1) * limit

	// Optional filters
	const statusFilter = url.searchParams.get('status')
	const kindFilter = url.searchParams.get('kind')
	const fiscalYearFilter = url.searchParams.get('fiscalYear')
	const orderIdFilter = url.searchParams.get('orderId')

	const where: Record<string, unknown> = {}
	if (statusFilter) where.status = statusFilter
	if (kindFilter) where.kind = kindFilter
	if (fiscalYearFilter) {
		const fy = parseInt(fiscalYearFilter, 10)
		if (!isNaN(fy)) where.fiscalYear = fy
	}
	if (orderIdFilter) where.orderId = orderIdFilter

	const [invoices, total] = await Promise.all([
		prisma.invoice.findMany({
			where,
			include: {
				order: {
					select: {
						id: true,
						orderNumber: true,
						email: true,
						shippingName: true,
					},
				},
			},
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit,
		}),
		prisma.invoice.count({ where }),
	])

	const data_ = invoices.map((inv) => ({
		id: inv.id,
		invoiceNumber: formatInvoiceNumber(inv.fiscalYear, inv.sequence),
		fiscalYear: inv.fiscalYear,
		sequence: inv.sequence,
		kind: inv.kind,
		subtotalCents: inv.subtotalCents,
		totalCents: inv.totalCents,
		vatTotalCents: inv.vatTotalCents,
		status: inv.status,
		issuedAt: inv.issuedAt?.toISOString() ?? null,
		createdAt: inv.createdAt.toISOString(),
		order: inv.order,
	}))

	return {
		data: data_,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	}
}
