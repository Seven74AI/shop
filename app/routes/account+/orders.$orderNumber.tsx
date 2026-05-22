import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { formatDate } from '#app/utils/date.ts'
import { formatAddress } from '#app/utils/address.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { formatInvoiceNumber } from '#app/utils/invoice.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/orders.$orderNumber.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Order Details',
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orderNumber } = params
	const userId = await getUserId(request)
	const url = new URL(request.url)
	const email = url.searchParams.get('email')

	// Try to get order by order number
	let order = await getOrderByOrderNumber(orderNumber)

	// If not found, return 404
	invariantResponse(order, 'Order not found', { status: 404 })

	// Authorization check
	if (order.userId) {
		// Order belongs to a user - require authentication
		invariantResponse(userId === order.userId, 'Unauthorized', { status: 403 })
	} else {
		// Guest order - require email verification
		invariantResponse(email, 'Email required to view guest order', { status: 400 })
		invariantResponse(
			email.toLowerCase() === order.email.toLowerCase(),
			'Email does not match order',
			{ status: 403 },
		)
	}

	// Fetch invoices for this order
	const invoices = await prisma.invoice.findMany({
		where: { orderId: order.id },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			fiscalYear: true,
			sequence: true,
			kind: true,
			status: true,
			totalCents: true,
			issuedAt: true,
			createdAt: true,
		},
	})

	return { order, invoices }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.order) {
		return [{ title: 'Order Not Found | Account | Epic Shop' }]
	}
	return [{ title: `Order ${loaderData.order.orderNumber} | Account | Epic Shop` }]
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
	const { locale } = useTranslation()
	const { order, invoices } = loaderData

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Order {order.orderNumber}</h1>
					<p className="text-gray-600">
						Order Number: <span className="font-semibold">{order.orderNumber}</span>
					</p>
				</div>
				<div className="flex items-center gap-4">
					<OrderStatusBadge status={order.status} className="text-sm" />
					<Button variant="outline" asChild>
						<Link to="/account/orders">
							<Icon name="arrow-left" className="h-4 w-4 mr-2" />
							Back to Orders
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{/* Order Items */}
				<Card>
					<CardHeader>
						<h2>Items</h2>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{order.items.map((item) => (
								<div key={item.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
									{item.product.images[0] && (
										<img
											src={`/resources/images?objectKey=${encodeURIComponent(item.product.images[0].objectKey)}`}
											alt={item.product.images[0].altText || item.product.name}
											className="w-16 h-16 object-cover rounded"
										/>
									)}
									<div className="flex-1">
										<h2 className="font-semibold">{item.product.name}</h2>
										{item.variant && (
											<p className="text-sm text-gray-500">
												{item.variant.attributeValues
													.map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
													.join(', ')}
											</p>
										)}
										<p className="text-sm text-gray-500">
											Quantity: {item.quantity}
										</p>
									</div>
									<div className="text-right">
										<p className="font-semibold">{formatPrice(item.price, null, locale)}</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Order Summary */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<h2>Order Summary</h2>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between">
								<span className="text-gray-500">Subtotal</span>
								<span>{formatPrice(order.subtotal, null, locale)}</span>
							</div>
							{order.shippingCost > 0 && (
								<div className="flex justify-between">
									<span className="text-gray-500">Shipping</span>
									<span>{formatPrice(order.shippingCost, null, locale)}</span>
								</div>
							)}
							{order.vatTotalCents > 0 && order.vatBreakdown && Array.isArray(order.vatBreakdown) && (
								<>
									{(order.vatBreakdown as Array<{ kind: string; rate: number; vatCents: number }>).map((line, i) => (
										<div key={i} className="flex justify-between text-sm text-gray-500">
											<span>VAT ({line.kind} {(line.rate / 100).toFixed(1)}%)</span>
											<span>{formatPrice(line.vatCents, null, locale)}</span>
										</div>
									))}
								</>
							)}
							<div className="border-t pt-4 flex justify-between text-lg font-bold">
								<span>Total</span>
								<span>{formatPrice(order.total, null, locale)}</span>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<h2>Shipping Address</h2>
						</CardHeader>
						<CardContent>
							{(() => {
								const addr = formatAddress({
									name: order.shippingName ?? '',
									street: order.shippingStreet ?? '',
									city: order.shippingCity ?? '',
									state: order.shippingState,
									postal: order.shippingPostal ?? '',
									country: order.shippingCountry ?? '',
								})
								return (
									<>
										{addr.lines.map((line, i) => (
											<p key={i} className={i === 0 ? 'font-semibold' : 'text-gray-500'}>
												{line}
											</p>
										))}
									</>
								)
							})()}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<h2>Order Information</h2>
						</CardHeader>
						<CardContent className="space-y-2">
							<div>
								<p className="text-sm text-gray-500">Order Date</p>
								<p>
								{formatDate(order.createdAt, locale, { dateStyle: 'full', timeStyle: 'short' })}
								</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Email</p>
								<p>{order.email}</p>
							</div>
							{order.trackingNumber && (
								<div>
									<p className="text-sm text-gray-500">Tracking Number</p>
									<p className="font-mono font-semibold">{order.trackingNumber}</p>
								</div>
							)}
						</CardContent>
					</Card>

					{invoices.length > 0 && (
						<Card>
							<CardHeader>
								<h2>Invoices</h2>
							</CardHeader>
							<CardContent className="space-y-3">
								{invoices.map((inv) => {
									const invNumber = formatInvoiceNumber(inv.fiscalYear, inv.sequence)
									return (
										<div
											key={inv.id}
											className="flex items-center justify-between py-2 border-b last:border-0"
										>
											<div className="flex items-center gap-3">
												<Icon name="file-text" className="h-5 w-5 text-gray-500" />
												<div>
													<Link
														to={`/account/invoices/${inv.id}.pdf`}
														reloadDocument
														className="font-medium hover:text-primary hover:underline"
													>
														{invNumber}
													</Link>
													<p className="text-xs text-gray-500">
														{inv.kind === 'CREDIT_NOTE' ? 'Credit Note' : 'Invoice'}
														{inv.status === 'DRAFT' && ' · Draft'}
														{inv.status === 'CANCELLED' && ' · Cancelled'}
														{inv.issuedAt &&
															` · ${new Date(inv.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-3">
												<span className="text-sm font-medium text-gray-900">
													{formatPrice(inv.totalCents, null, locale)}
												</span>
												<Button variant="outline" size="sm" asChild>
													<Link
														to={`/account/invoices/${inv.id}.pdf`}
														reloadDocument
													>
														<Icon name="download" className="h-4 w-4 mr-2" />
														Download
													</Link>
												</Button>
											</div>
										</div>
									)
								})}
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			<div className="flex gap-4">
				<Button variant="outline" asChild>
					<Link to="/account/orders">Back to Orders</Link>
				</Button>
				<Button asChild>
					<Link to="/shop">Continue Shopping</Link>
				</Button>
			</div>
		</div>
	)
}
