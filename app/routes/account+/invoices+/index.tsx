import { Link, data } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatInvoiceNumber } from '#app/utils/invoice.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { type Route } from './+types/invoices+/_index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const invoices = await prisma.invoice.findMany({
		where: {
			kind: 'INVOICE',
			order: { userId },
		},
		orderBy: { createdAt: 'desc' },
		include: {
			order: {
				select: {
					id: true,
					orderNumber: true,
					total: true,
					createdAt: true,
				},
			},
		},
	})

	return { invoices }
}

// No action needed — read-only list
export async function action(_args: Route.ActionArgs) {
	return data({}, { status: 405 })
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Invoices | Account | Epic Shop' },
]

export default function InvoicesPage({ loaderData }: Route.ComponentProps) {
	const { locale } = useTranslation()
	const { invoices } = loaderData

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
					<p className="text-gray-600">
						View and download your invoices ({invoices.length} total)
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Account
					</Link>
				</Button>
			</div>

			{invoices.length === 0 ? (
				<Card className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm">
					<CardContent className="py-12 text-center">
						<Icon name="file-text" className="h-12 w-12 mx-auto mb-4 text-gray-500" />
						<p className="text-lg text-gray-900 mb-2">
							You don't have any invoices yet.
						</p>
						<p className="text-sm text-gray-500 mb-4">
							Invoices are generated when your orders are confirmed.
						</p>
						<Button asChild>
							<Link to="/account/orders">View Your Orders</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{invoices.map((invoice) => {
						const invoiceNumber = formatInvoiceNumber(
							invoice.fiscalYear,
							invoice.sequence,
						)
						return (
							<Card
								key={invoice.id}
								className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm"
							>
								<CardContent className="p-0">
									<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
										<div className="flex-1">
											<div className="flex items-center gap-3 mb-2">
												<span className="font-semibold text-lg text-gray-900">
													{invoiceNumber}
												</span>
												{invoice.status === 'FINAL' && (
													<span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
														Issued
													</span>
												)}
												{invoice.status === 'DRAFT' && (
													<span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
														Draft
													</span>
												)}
												{invoice.status === 'CANCELLED' && (
													<span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
														Cancelled
													</span>
												)}
											</div>
											<p className="text-sm text-gray-500">
												{invoice.order?.orderNumber && (
													<>
														Order{' '}
														<Link
															to={`/account/orders/${invoice.order.orderNumber}`}
															className="font-medium hover:text-primary hover:underline"
														>
															{invoice.order.orderNumber}
														</Link>
														{' · '}
													</>
												)}
												{new Date(invoice.createdAt).toLocaleDateString('en-US', {
													year: 'numeric',
													month: 'long',
													day: 'numeric',
												})}
											</p>
											{invoice.issuedAt && (
												<p className="text-sm text-gray-500 mt-1">
													Issued:{' '}
													{new Date(invoice.issuedAt).toLocaleDateString('en-US', {
														year: 'numeric',
														month: 'long',
														day: 'numeric',
													})}
												</p>
											)}
										</div>
										<div className="text-right">
											<p className="text-xl font-bold text-gray-900">
												{formatPrice(invoice.totalCents, null, locale)}
											</p>
											<Button variant="outline" size="sm" asChild className="mt-2">
												<Link
													to={`/account/invoices/${invoice.id}.pdf`}
													reloadDocument
												>
													<Icon name="download" className="h-4 w-4 mr-2" />
													Download PDF
												</Link>
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						)
					})}
				</div>
			)}
		</div>
	)
}
