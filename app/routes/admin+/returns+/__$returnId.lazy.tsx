import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, Link } from 'react-router'
import { z } from 'zod'
import { ReturnStatusBadge } from '#app/components/return-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { getReturnRequestById } from '#app/utils/return-queries.server.ts'
import { getReturnStatusLabel } from '#app/utils/return-status.ts'
import { updateReturnStatus } from '#app/utils/return.server.ts'
import { type Route } from './+types/$returnId.ts'
import { ReturnManagementCard } from './__return-management-card.tsx'

const StatusUpdateSchema = z.object({
	status: z.enum(
		['REQUESTED', 'APPROVED', 'SHIPPED', 'RECEIVED', 'REFUNDED', 'REJECTED'],
		{
			error:
				'Status must be one of: REQUESTED, APPROVED, SHIPPED, RECEIVED, REFUNDED, REJECTED',
		},
	),
	adminNotes: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? undefined
					: 'Admin notes must be a string',
		})
		.optional(),
	refundAmountCents: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? undefined
					: 'Refund amount must be a string',
		})
		.optional(),
	restockingFeeCents: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? undefined
					: 'Restocking fee must be a string',
		})
		.optional(),
})




export default function AdminReturnDetail({
	loaderData,
}: Route.ComponentProps) {
	const { returnRequest, currency } = loaderData

	const itemCount = returnRequest.items.reduce(
		(sum, item) => sum + item.quantity,
		0,
	)

	return (
		<div className="space-y-6 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button
						asChild
						variant="ghost"
						size="icon"
						className="h-9 w-9 rounded-lg transition-all duration-200 hover:bg-muted"
						aria-label="Back to returns"
					>
						<Link to="/admin/returns">
							<Icon
								name="arrow-left"
								className="h-5 w-5"
								aria-hidden="true"
							/>
						</Link>
					</Button>
					<div>
						<div className="flex items-center gap-4 mb-1">
							<h1 className="text-2xl font-normal tracking-tight text-foreground">
								Return Request
							</h1>
							<ReturnStatusBadge
								status={returnRequest.status}
								className="text-xs font-medium px-2 py-0.5 rounded-lg"
							/>
						</div>
						<p className="text-sm text-muted-foreground">
							Requested on{' '}
							{new Date(returnRequest.requestedAt).toLocaleDateString(
								'en-US',
								{
									year: 'numeric',
									month: 'long',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
								},
							)}
						</p>
					</div>
				</div>
				<Button
					asChild
					variant="outline"
					className="h-9 px-4 rounded-lg transition-all duration-200"
				>
					<Link to="/admin/returns">Back to Returns</Link>
				</Button>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Return Details */}
				<div className="space-y-6">
					{/* Return Information */}
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<h2 className="text-base font-normal text-foreground">
								Return Information
							</h2>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="grid grid-cols-2 gap-6">
								{/* Order */}
								<div className="flex items-start gap-3">
									<div
										className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0"
										aria-hidden="true"
									>
										<Icon
											name="file-text"
											className="h-5 w-5 text-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">
											Order
										</label>
										<p className="text-base font-normal text-[var(--text-dark)]">
											<Link
												to={`/admin/orders/${returnRequest.order.orderNumber}`}
												className="hover:underline transition-colors duration-200 text-[var(--text-dark)]"
											>
												{returnRequest.order.orderNumber}
											</Link>
										</p>
									</div>
								</div>

								{/* Customer */}
								<div className="flex items-start gap-3">
									<div
										className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0"
										aria-hidden="true"
									>
										<Icon
											name="user"
											className="h-5 w-5 text-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">
											Customer
										</label>
										<p className="text-base font-normal text-[var(--text-dark)]">
											{returnRequest.order.user ? (
												<Link
													to={`/admin/users/${returnRequest.order.user.id}`}
													className="hover:underline transition-colors duration-200 text-[var(--text-dark)]"
												>
													{returnRequest.order.user.name ||
														returnRequest.order.user
															.username}
												</Link>
											) : (
												<span className="text-muted-foreground">
													Guest
												</span>
											)}
										</p>
									</div>
								</div>

								{/* Email */}
								<div className="flex items-start gap-3">
									<div
										className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0"
										aria-hidden="true"
									>
										<Icon
											name="envelope-closed"
											className="h-5 w-5 text-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">
											Email
										</label>
										<p className="text-base font-normal text-[var(--text-dark)]">
											{returnRequest.order.email}
										</p>
									</div>
								</div>

								{/* Items Count */}
								<div className="flex items-start gap-3">
									<div
										className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0"
										aria-hidden="true"
									>
										<Icon
											name="package"
											className="h-5 w-5 text-muted-foreground"
										/>
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">
											Items
										</label>
										<p className="text-base font-normal text-[var(--text-dark)]">
											{itemCount} item{itemCount !== 1 ? 's' : ''}
										</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Reason & Notes */}
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<CardTitle className="text-base font-normal text-foreground">
								Reason & Notes
							</CardTitle>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="space-y-4">
								<div>
									<label className="text-sm text-muted-foreground block mb-1">
										Customer Reason
									</label>
									<p className="text-base text-[var(--text-dark)]">
										{returnRequest.reason}
									</p>
								</div>
								{returnRequest.customerNotes && (
									<div>
										<label className="text-sm text-muted-foreground block mb-1">
											Customer Notes
										</label>
										<p className="text-base text-muted-foreground whitespace-pre-wrap">
											{returnRequest.customerNotes}
										</p>
									</div>
								)}
								{returnRequest.adminNotes && (
									<div>
										<label className="text-sm text-muted-foreground block mb-1">
											Admin Notes
										</label>
										<p className="text-base text-muted-foreground whitespace-pre-wrap">
											{returnRequest.adminNotes}
										</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Refund Information */}
					{(returnRequest.refundAmountCents !== null ||
						returnRequest.restockingFeeCents !== null) && (
						<Card className="rounded-[14px]">
							<CardHeader className="pb-6 px-6 pt-6">
								<CardTitle className="text-base font-normal text-foreground">
									Refund Details
								</CardTitle>
							</CardHeader>
							<CardContent className="px-6 pb-6">
								<div className="space-y-2">
									{returnRequest.refundAmountCents !== null && (
										<div className="flex items-center justify-between">
											<span className="text-sm text-[var(--text-medium)]">
												Refund Amount
											</span>
											<span className="text-sm font-medium text-green-700">
												{formatPrice(
													returnRequest.refundAmountCents,
													currency,
												)}
											</span>
										</div>
									)}
									{returnRequest.restockingFeeCents !== null &&
										returnRequest.restockingFeeCents > 0 && (
											<div className="flex items-center justify-between">
												<span className="text-sm text-[var(--text-medium)]">
													Restocking Fee
												</span>
												<span className="text-sm font-medium text-destructive">
													-{formatPrice(
														returnRequest.restockingFeeCents,
														currency,
													)}
												</span>
											</div>
										)}
									{returnRequest.refundedAt && (
										<div className="pt-2 border-t border-border">
											<span className="text-xs text-muted-foreground">
												Refunded on{' '}
												{new Date(
													returnRequest.refundedAt,
												).toLocaleDateString('en-US', {
													year: 'numeric',
													month: 'long',
													day: 'numeric',
												})}
											</span>
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Status Management */}
					<ReturnManagementCard returnRequest={returnRequest} />

					{/* Timestamps */}
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<CardTitle className="text-base font-normal text-foreground">
								Timeline
							</CardTitle>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="space-y-3">
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">
										Requested
									</span>
									<span className="text-[var(--text-dark)]">
										{new Date(
											returnRequest.requestedAt,
										).toLocaleDateString('en-US', {
											year: 'numeric',
											month: 'short',
											day: 'numeric',
											hour: '2-digit',
											minute: '2-digit',
										})}
									</span>
								</div>
								{returnRequest.shippedAt && (
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">
											Shipped
										</span>
										<span className="text-[var(--text-dark)]">
											{new Date(
												returnRequest.shippedAt,
											).toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'short',
												day: 'numeric',
												hour: '2-digit',
												minute: '2-digit',
											})}
										</span>
									</div>
								)}
								{returnRequest.receivedAt && (
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">
											Received
										</span>
										<span className="text-[var(--text-dark)]">
											{new Date(
												returnRequest.receivedAt,
											).toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'short',
												day: 'numeric',
												hour: '2-digit',
												minute: '2-digit',
											})}
										</span>
									</div>
								)}
								{returnRequest.refundedAt && (
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">
											Refunded
										</span>
										<span className="text-[var(--text-dark)]">
											{new Date(
												returnRequest.refundedAt,
											).toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'short',
												day: 'numeric',
												hour: '2-digit',
												minute: '2-digit',
											})}
										</span>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Return Items */}
				<div className="space-y-6">
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<CardTitle className="text-base font-normal text-foreground">
								Return Items
							</CardTitle>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="space-y-4">
								{returnRequest.items.map((returnItem) => (
									<div
										key={returnItem.id}
										className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0"
									>
										{returnItem.orderItem.product.images[0] && (
											<img
												src={`/resources/images?objectKey=${encodeURIComponent(
													returnItem.orderItem.product.images[0]
														.objectKey,
												)}`}
												alt={
													returnItem.orderItem.product.images[0]
														.altText ||
													returnItem.orderItem.product.name
												}
												className="w-16 h-16 object-cover flex-shrink-0 rounded-[10px]"
											/>
										)}
										<div className="flex-1 min-w-0">
											<Link
												to={`/admin/products/${returnItem.orderItem.product.slug}`}
												className="text-sm font-normal hover:underline transition-colors duration-200 block mb-2 text-[var(--text-dark)]"
											>
												{returnItem.orderItem.product.name}
											</Link>
											{returnItem.orderItem.variant && (
												<p className="text-sm mb-2 text-muted-foreground">
													{returnItem.orderItem.variant.attributeValues
														.map(
															(av) =>
																`${av.attributeValue.attribute.name}: ${av.attributeValue.value}`,
														)
														.join(', ')}
												</p>
											)}
											<div className="flex items-center justify-between">
												<span className="text-sm text-muted-foreground">
													Returning: {returnItem.quantity}
												</span>
												<span className="text-sm font-normal text-foreground">
													{formatPrice(
														returnItem.orderItem.price *
															returnItem.quantity,
														currency,
													)}
												</span>
											</div>
											{returnItem.reasonItem && (
												<p className="text-xs text-muted-foreground mt-1">
													Reason: {returnItem.reasonItem}
												</p>
											)}
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
			<Icon
				name="question-mark-circled"
				className="h-12 w-12 text-muted-foreground"
				aria-hidden="true"
			/>
			<h2 className="text-xl font-semibold">Return not found</h2>
			<p className="text-muted-foreground text-center">
				The return request you're looking for doesn't exist or has been
				deleted.
			</p>
			<Button asChild>
				<Link to="/admin/returns">
					<Icon
						name="arrow-left"
						className="mr-2 h-4 w-4"
						aria-hidden="true"
					/>
					Back to Returns
				</Link>
			</Button>
		</div>
	)
}
