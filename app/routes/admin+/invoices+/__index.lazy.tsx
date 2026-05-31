import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/index.ts'



export default function InvoicesList({ loaderData }: Route.ComponentProps) {
	const { invoices, currency } = loaderData

	const customerName = (invoice: (typeof invoices)[number]) => {
		if (invoice.order.user?.name) return invoice.order.user.name
		if (invoice.order.shippingName) return invoice.order.shippingName
		return 'Guest'
	}

	const invoiceNumber = (invoice: (typeof invoices)[number]) =>
		`F${invoice.fiscalYear}-${String(invoice.sequence).padStart(5, '0')}`

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Invoices
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage all invoices ({invoices.length} total)
					</p>
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Invoice #</TableHead>
						<TableHead className="hidden md:table-cell">Order</TableHead>
						<TableHead className="hidden md:table-cell">Customer</TableHead>
						<TableHead>Subtotal</TableHead>
						<TableHead>Total</TableHead>
						<TableHead>VAT</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="hidden md:table-cell">Date</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{invoices.length === 0 ? (
						<TableRow>
							<TableCell colSpan={9} className="text-center py-8">
								<div className="text-muted-foreground">
									<Icon name="archive" className="h-8 w-8 mx-auto mb-2 opacity-50" />
									<p>No invoices found.</p>
									<p className="text-sm">
										Create invoices from the order detail page.
									</p>
								</div>
							</TableCell>
						</TableRow>
					) : (
						invoices.map((invoice) => (
							<TableRow
								key={invoice.id}
								className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
							>
								<TableCell>
									<Link
										to={`/admin/invoices/${invoice.id}`}
										className="font-medium text-primary hover:underline transition-colors duration-200"
										aria-label={`View invoice ${invoiceNumber(invoice)}`}
									>
										{invoiceNumber(invoice)}
									</Link>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<Link
										to={`/admin/orders/${invoice.order.orderNumber}`}
										className="text-muted-foreground hover:underline transition-colors duration-200"
									>
										{invoice.order.orderNumber}
									</Link>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground">
										{customerName(invoice)}
									</span>
								</TableCell>
								<TableCell>
									{formatPrice(invoice.subtotalCents, currency)}
								</TableCell>
								<TableCell>
									<span className="font-medium">
										{formatPrice(invoice.totalCents, currency)}
									</span>
								</TableCell>
								<TableCell>
									{formatPrice(invoice.vatTotalCents, currency)}
								</TableCell>
								<TableCell>
									<span
										className={`text-xs font-medium px-2 py-0.5 rounded-full ${
											invoice.status === 'FINAL'
												? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
												: invoice.status === 'DRAFT'
													? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
													: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
										}`}
									>
										{invoice.status}
									</span>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground">
										{new Date(invoice.createdAt).toLocaleDateString()}
									</span>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<Button variant="ghost" size="sm" asChild>
											<Link
												to={`/admin/invoices/${invoice.id}`}
												aria-label={`View invoice ${invoiceNumber(invoice)}`}
											>
												<Icon
													name="eye-open"
													className="h-4 w-4"
													aria-hidden="true"
												/>
											</Link>
										</Button>
										<Button variant="ghost" size="sm" asChild>
											<a
												href={`/admin/invoices/${invoice.id}.pdf`}
												download={`invoice-${invoiceNumber(invoice)}.pdf`}
												aria-label={`Download invoice ${invoiceNumber(invoice)} as PDF`}
											>
												<Icon
													name="download"
													className="h-4 w-4"
													aria-hidden="true"
												/>
											</a>
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
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
