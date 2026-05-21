import { Link, data } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getReturnRequestsByUserId } from '#app/utils/return-queries.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/returns.index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const returns = await getReturnRequestsByUserId(userId)
	return { returns }
}

export async function action(_args: Route.ActionArgs) {
	return data({}, { status: 405 })
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Returns | Account | Epic Shop' },
]

const statusLabels: Record<string, { label: string; className: string }> = {
	REQUESTED: { label: 'Requested', className: 'bg-yellow-100 text-yellow-800' },
	APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
	RECEIVED: { label: 'Received', className: 'bg-purple-100 text-purple-800' },
	REFUNDED: { label: 'Refunded', className: 'bg-green-100 text-green-800' },
	REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
}

export default function ReturnsIndex({ loaderData }: Route.ComponentProps) {
	const { returns } = loaderData

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Returns</h1>
					<p className="text-gray-600">
						View your return requests ({returns.length} total)
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Account
					</Link>
				</Button>
			</div>

			{returns.length === 0 ? (
				<Card className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm">
					<CardContent className="py-12 text-center">
						<Icon name="package" className="h-12 w-12 mx-auto mb-4 text-gray-500" />
						<p className="text-lg text-gray-900 mb-2">
							No return requests yet.
						</p>
						<p className="text-sm text-gray-500 mb-4">
							If you need to return an item, visit your order details to start a return.
						</p>
						<Button asChild>
							<Link to="/account/orders">View Orders</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{returns.map((returnReq) => {
						const status = statusLabels[returnReq.status] ?? { label: returnReq.status, className: 'bg-gray-100 text-gray-800' }
						return (
							<Card key={returnReq.id} className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm">
								<CardContent className="p-0">
									<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
										<div className="flex-1">
											<div className="flex items-center gap-3 mb-2">
												<Link
													to={`/account/returns/${returnReq.id}`}
													className="font-semibold text-lg text-gray-900 hover:text-primary hover:underline"
												>
													Return for Order {returnReq.order.orderNumber}
												</Link>
												<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
													{status.label}
												</span>
											</div>
											<p className="text-sm text-gray-500">
												{new Date(returnReq.createdAt).toLocaleDateString('en-US', {
													year: 'numeric',
													month: 'long',
													day: 'numeric',
												})}
											</p>
											<p className="text-sm text-gray-500 mt-1">
												{returnReq.items.length} item{returnReq.items.length !== 1 ? 's' : ''} · {returnReq.reason.slice(0, 80)}{returnReq.reason.length > 80 ? '...' : ''}
											</p>
										</div>
										<div className="text-right">
											<Button variant="outline" size="sm" asChild>
												<Link to={`/account/returns/${returnReq.id}`}>
													View Details
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
