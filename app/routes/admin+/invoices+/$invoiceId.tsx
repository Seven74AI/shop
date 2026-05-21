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

export const meta: Route.MetaFunction = ({ data }) => {
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

export default function InvoiceDetail({ loaderData }: Route.ComponentProps) {
	const { invoice, currency } = loaderData
	const num = formatInvoiceNum(invoice.fiscalYear, invoice.sequence)

	const vatBreakdown = Array.isArray(invoice.vatBreakdown)
		? (invoice.vatBreakdown as Array<{
				kind: string
				rate: number
				baseCents: number
				vatCents: number
			}>)
		: []

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3">
						<Button variant="ghost" size="icon" asChild>
							<Link to="/admin/invoices" aria-label="Back to invoices">
								<Icon name="arrow-left" className="h-5 w-5" />
							</Link>
						</Button>
						<h1 className="text-2xl font-normal tracking-tight text-foreground">
							Invoice {num}
						</h1>
						{statusBadge(invoice.status)}
						{invoice.kind === 'CREDIT_NOTE' && (
							<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
								CREDIT NOTE
							</span>
						)}
					</div>
					<p className="text-sm text-muted-foreground mt-1 ml-12">
						Created {new Date(invoice.createdAt).toLocaleDateString()}
						{invoice.issuedAt &&
							` · Issued ${new Date(invoice.issuedAt).toLocaleDateString()}`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" asChild>
						<a
							href={`/admin/invoices/${invoice.id}.pdf`}
							download={`invoice-${num}.pdf`}
							aria-label={`Download invoice ${num} as PDF`}
						>
							<Icon name="download" className="h-4 w-4 mr-2" aria-hidden="true" />
							PDF
						</a>
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Invoice Details */}
				<Card>
					<CardHeader>
						<CardTitle>Invoice Details</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Invoice Number</span>
							<span className="font-medium">{num}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Fiscal Year</span>
							<span>{invoice.fiscalYear}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Sequence</span>
							<span>{invoice.sequence}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Kind</span>
							<span>{invoice.kind.replace('_', ' ')}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Status</span>
							{statusBadge(invoice.status)}
						</div>
					</CardContent>
				</Card>

				{/* Order Details */}
				<Card>
					<CardHeader>
						<CardTitle>Order</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Order Number</span>
							<Link
								to={`/admin/orders/${invoice.order.orderNumber}`}
								className="font-medium text-primary hover:underline"
							>
								{invoice.order.orderNumber}
							</Link>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Customer</span>
							<span>
								{invoice.order.user?.name ||
									invoice.order.shippingName ||
									'Guest'}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Email</span>
							<span className="text-sm">
								{invoice.order.user?.email || invoice.order.email}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Order Date</span>
							<span>
								{new Date(invoice.order.createdAt).toLocaleDateString()}
							</span>
						</div>
					</CardContent>
				</Card>

				{/* Financial Summary */}
				<Card>
					<CardHeader>
						<CardTitle>Financial Summary</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Subtotal</span>
							<span>{formatPrice(invoice.subtotalCents, currency)}</span>
						</div>
						{vatBreakdown.length > 0 && (
							<>
								<div className="border-t pt-2">
									<span className="text-xs text-muted-foreground uppercase tracking-wider">
										VAT Breakdown
									</span>
								</div>
								{vatBreakdown.map((vat, idx) => (
									<div key={idx} className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											{vat.kind} ({(vat.rate / 100).toFixed(1)}%)
										</span>
										<span>
											<span className="text-muted-foreground text-xs mr-1">
												base {formatPrice(vat.baseCents, currency)}
											</span>
											{formatPrice(vat.vatCents, currency)}
										</span>
									</div>
								))}
								<div className="flex justify-between border-t pt-2">
									<span className="text-muted-foreground">VAT Total</span>
									<span>{formatPrice(invoice.vatTotalCents, currency)}</span>
								</div>
							</>
						)}
						{vatBreakdown.length === 0 && (
							<div className="flex justify-between">
								<span className="text-muted-foreground">VAT</span>
								<span>{formatPrice(invoice.vatTotalCents, currency)}</span>
							</div>
						)}
						<div className="flex justify-between border-t pt-2 font-semibold">
							<span>Total</span>
							<span>{formatPrice(invoice.totalCents, currency)}</span>
						</div>
					</CardContent>
				</Card>

				{/* Credit Notes / Parent */}
				<Card>
					<CardHeader>
						<CardTitle>Relations</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{invoice.parentInvoice && (
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									{invoice.kind === 'CREDIT_NOTE'
										? 'Corrects Invoice'
										: 'Parent Invoice'}
								</span>
								<Link
									to={`/admin/invoices/${invoice.parentInvoice.id}`}
									className="font-medium text-primary hover:underline"
								>
									{formatInvoiceNum(
										invoice.parentInvoice.fiscalYear,
										invoice.parentInvoice.sequence,
									)}
								</Link>
							</div>
						)}
						{invoice.creditNotes.length > 0 && (
							<>
								<div className="border-t pt-2">
									<span className="text-xs text-muted-foreground uppercase tracking-wider">
										Credit Notes ({invoice.creditNotes.length})
									</span>
								</div>
								{invoice.creditNotes.map((cn) => (
									<div key={cn.id} className="flex justify-between">
										<Link
											to={`/admin/invoices/${cn.id}`}
											className="text-primary hover:underline"
										>
											{formatInvoiceNum(cn.fiscalYear, cn.sequence)}
										</Link>
										<span className="flex items-center gap-2">
											{formatPrice(cn.totalCents, currency)}
											{statusBadge(cn.status)}
										</span>
									</div>
								))}
							</>
						)}
						{!invoice.parentInvoice && invoice.creditNotes.length === 0 && (
							<p className="text-muted-foreground text-sm">
								No related invoices or credit notes.
							</p>
						)}
					</CardContent>
				</Card>

				{/* Shipping Address */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Shipping Address</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-sm space-y-1">
							<p>{invoice.order.shippingName}</p>
							<p>{invoice.order.shippingStreet}</p>
							<p>
								{invoice.order.shippingPostal} {invoice.order.shippingCity}
							</p>
							<p>{invoice.order.shippingCountry}</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="archive" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Invoice Not Found</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' && error.data && 'message' in error.data
								? String(error.data.message)
								: 'The requested invoice could not be found.'}
						</p>
						<Button asChild>
							<Link to="/admin/invoices">Back to Invoices</Link>
						</Button>
					</div>
				),
				403: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="lock-closed" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' && error.data && 'message' in error.data
								? String(error.data.message)
								: 'You do not have permission to access this page.'}
						</p>
						<Button asChild>
							<Link to="/admin">Back to Dashboard</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
