import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getReturnRequestById } from '#app/utils/return-queries.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/returns.$returnId.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Return Details',
}

const statusLabels: Record<string, { label: string; className: string }> = {
	REQUESTED: { label: 'Requested', className: 'bg-yellow-100 text-yellow-800' },
	APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
	RECEIVED: { label: 'Received', className: 'bg-purple-100 text-purple-800' },
	REFUNDED: { label: 'Refunded', className: 'bg-green-100 text-green-800' },
	REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const { returnId } = params

	const returnRequest = await getReturnRequestById(returnId)
	invariantResponse(returnRequest, 'Return request not found', { status: 404 })

	// Verify the return request belongs to the authenticated user
	invariantResponse(
		returnRequest.order.userId === userId,
		'Unauthorized',
		{ status: 403 },
	)

	return { returnRequest }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.returnRequest) {
		return [{ title: 'Return Not Found | Account | Epic Shop' }]
	}
	return [{ title: `Return Details | Account | Epic Shop` }]
}

export default function ReturnDetail({ loaderData }: Route.ComponentProps) {
	const { returnRequest } = loaderData
	const status = statusLabels[returnRequest.status] ?? { label: returnRequest.status, className: 'bg-gray-100 text-gray-800' }

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Return Request</h1>
					<p className="text-gray-600">
						For order{' '}
						<Link
							to={`/account/orders/${returnRequest.order.orderNumber}`}
							className="font-semibold text-primary hover:underline"
						>
							{returnRequest.order.orderNumber}
						</Link>
					</p>
				</div>
				<div className="flex items-center gap-4">
					<span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${status.className}`}>
						{status.label}
					</span>
					<Button variant="outline" asChild>
						<Link to="/account/returns">
							<Icon name="arrow-left" className="h-4 w-4 mr-2" />
							Back to Returns
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{/* Return Items */}
				<Card>
					<CardHeader>
						<h2>Items Being Returned</h2>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{returnRequest.items.map((returnItem) => (
								<div key={returnItem.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
									{returnItem.orderItem.product.images[0] && (
										<img
											src={`/resources/images?objectKey=${encodeURIComponent(returnItem.orderItem.product.images[0].objectKey)}`}
											alt={returnItem.orderItem.product.images[0].altText || returnItem.orderItem.product.name}
											className="w-16 h-16 object-cover rounded"
										/>
									)}
									<div className="flex-1">
										<h3 className="font-semibold">{returnItem.orderItem.product.name}</h3>
										{returnItem.orderItem.variant && (
											<p className="text-sm text-gray-500">
												{returnItem.orderItem.variant.attributeValues
													.map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
													.join(', ')}
											</p>
										)}
										<p className="text-sm text-gray-500">
											Quantity returning: {returnItem.quantity}
										</p>
										{returnItem.reasonItem && (
											<p className="text-sm text-gray-500 mt-1">
												<span className="font-medium">Item reason:</span> {returnItem.reasonItem}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Return Details */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<h2>Return Reason</h2>
						</CardHeader>
						<CardContent>
							<p className="text-gray-700 whitespace-pre-wrap">{returnRequest.reason}</p>
						</CardContent>
					</Card>

					{returnRequest.customerNotes && (
						<Card>
							<CardHeader>
								<h2>Additional Notes</h2>
							</CardHeader>
							<CardContent>
								<p className="text-gray-700 whitespace-pre-wrap">{returnRequest.customerNotes}</p>
							</CardContent>
						</Card>
					)}

					<Card>
						<CardHeader>
							<h2>Return Information</h2>
						</CardHeader>
						<CardContent className="space-y-2">
							<div>
								<p className="text-sm text-gray-500">Request Date</p>
								<p>
									{new Date(returnRequest.requestedAt).toLocaleDateString('en-US', {
										year: 'numeric',
										month: 'long',
										day: 'numeric',
										hour: '2-digit',
										minute: '2-digit',
									})}
								</p>
							</div>
							{returnRequest.refundAmountCents != null && (
								<div>
									<p className="text-sm text-gray-500">Refund Amount</p>
									<p className="font-semibold">{formatPrice(returnRequest.refundAmountCents)}</p>
								</div>
							)}
							{returnRequest.restockingFeeCents != null && (
								<div>
									<p className="text-sm text-gray-500">Restocking Fee</p>
									<p>{formatPrice(returnRequest.restockingFeeCents)}</p>
								</div>
							)}
							{returnRequest.adminNotes && (
								<div>
									<p className="text-sm text-gray-500">Admin Notes</p>
									<p className="text-gray-700 whitespace-pre-wrap">{returnRequest.adminNotes}</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
