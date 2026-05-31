import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$invoiceId.ts'

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
					shippingName: true,
					shippingStreet: true,
					shippingCity: true,
					shippingPostal: true,
					shippingCountry: true,
					subtotal: true,
					total: true,
					createdAt: true,
					user: {
						select: {
							id: true,
							email: true,
							name: true,
							username: true,
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

	const currency = await getStoreCurrency()

	return { invoice, currency }
}

export function meta({ data }: { data: Awaited<ReturnType<typeof loader>> | undefined }) {
	if (!data) return [{ title: 'Invoice Not Found | Admin | Epic Shop' }]
	const num = `F${data.invoice.fiscalYear}-${String(data.invoice.sequence).padStart(5, '0')}`
	return [
		{ title: `Invoice ${num} | Admin | Epic Shop` },
		{ name: 'description', content: `View invoice ${num}` },
	]
}

function formatInvoiceNum(fiscalYear: number, sequence: number) {
	return `F${fiscalYear}-${String(sequence).padStart(5, '0')}`
}

const statusBadge = (status: string) => {
	const colors =
		status === 'FINAL'
			? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
			: status === 'DRAFT'
				? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
				: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
	return (
		<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors}`}>
			{status}
		</span>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$invoiceId.lazy')
