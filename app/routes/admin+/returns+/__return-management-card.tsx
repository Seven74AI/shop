import { useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { cn } from '#app/utils/misc.tsx'

interface ReturnRequestData {
	id: string
	status: string
	adminNotes: string | null
	refundAmountCents: number | null
	restockingFeeCents: number | null
}

interface ReturnManagementCardProps {
	returnRequest: ReturnRequestData
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
	REQUESTED: ['APPROVED', 'REJECTED'],
	APPROVED: ['SHIPPED', 'RECEIVED', 'REJECTED'],
	SHIPPED: ['RECEIVED', 'REJECTED'],
	RECEIVED: ['REFUNDED', 'REJECTED'],
	REFUNDED: [],
	REJECTED: [],
}

export function ReturnManagementCard({
	returnRequest,
}: ReturnManagementCardProps) {
	const fetcher = useFetcher()
	const availableStatuses =
		STATUS_TRANSITIONS[returnRequest.status] || []
	const isTerminal =
		returnRequest.status === 'REFUNDED' ||
		returnRequest.status === 'REJECTED'
	const isProcessing = fetcher.state !== 'idle'

	if (isTerminal && !returnRequest.adminNotes) {
		return (
			<Card className="rounded-[14px]">
				<CardHeader className="pb-6 px-6 pt-6">
					<CardTitle className="text-base font-normal text-foreground">
						Status Management
					</CardTitle>
				</CardHeader>
				<CardContent className="px-6 pb-6">
					<div className="flex items-center gap-3">
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0">
							<Icon
								name="lock-closed"
								className="h-5 w-5 text-muted-foreground"
							/>
						</div>
						<p className="text-sm text-muted-foreground">
							This return has been{' '}
							{returnRequest.status.toLowerCase()}. No further
							actions are available.
						</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="rounded-[14px]">
			<CardHeader className="pb-6 px-6 pt-6">
				<CardTitle className="text-base font-normal text-foreground">
					{isTerminal ? 'Status Management' : 'Update Status'}
				</CardTitle>
			</CardHeader>
			<CardContent className="px-6 pb-6">
				{isTerminal ? (
					<div className="flex items-center gap-3">
						<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0">
							<Icon
								name="lock-closed"
								className="h-5 w-5 text-muted-foreground"
							/>
						</div>
						<p className="text-sm text-muted-foreground">
							This return has been{' '}
							{returnRequest.status.toLowerCase()}. No further
							actions are available.
						</p>
					</div>
				) : (
					<fetcher.Form
						method="POST"
						className="space-y-4"
					>
						{/* Status Select */}
						<div className="space-y-2">
							<Label htmlFor="status">New Status</Label>
							<Select
								name="status"
								defaultValue={returnRequest.status}
								disabled={isProcessing}
							>
								<SelectTrigger
									id="status"
									className={cn(
										'transition-all duration-200',
										isProcessing && 'opacity-50',
									)}
								>
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									{availableStatuses.map((status) => (
										<SelectItem key={status} value={status}>
											{status.charAt(0) +
												status.slice(1).toLowerCase()}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Admin Notes */}
						<div className="space-y-2">
							<Label htmlFor="adminNotes">
								Admin Notes (internal)
							</Label>
							<Textarea
								id="adminNotes"
								name="adminNotes"
								placeholder="Add internal notes about this return..."
								defaultValue={returnRequest.adminNotes || ''}
								disabled={isProcessing}
								className={cn(
									'min-h-[80px]',
									isProcessing && 'opacity-50',
								)}
							/>
						</div>

						{/* Refund Amount (shown when transitioning to REFUNDED) */}
						<div className="space-y-2">
							<Label htmlFor="refundAmountCents">
								Refund Amount (in cents)
							</Label>
							<Input
								id="refundAmountCents"
								name="refundAmountCents"
								type="number"
								placeholder="Enter refund amount in cents..."
								defaultValue={
									returnRequest.refundAmountCents?.toString() ||
									''
								}
								disabled={isProcessing}
								className={cn(
									isProcessing && 'opacity-50',
								)}
							/>
						</div>

						{/* Restocking Fee */}
						<div className="space-y-2">
							<Label htmlFor="restockingFeeCents">
								Restocking Fee (in cents)
							</Label>
							<Input
								id="restockingFeeCents"
								name="restockingFeeCents"
								type="number"
								placeholder="Enter restocking fee in cents..."
								defaultValue={
									returnRequest.restockingFeeCents?.toString() ||
									''
								}
								disabled={isProcessing}
								className={cn(
									isProcessing && 'opacity-50',
								)}
							/>
						</div>

						<Button
							type="submit"
							disabled={isProcessing}
							className="w-full h-9 rounded-lg font-medium"
						>
							{isProcessing ? (
								<>
									<Icon
										name="update"
										className="mr-2 h-4 w-4 animate-spin"
									/>
									Updating...
								</>
							) : (
								'Update Return'
							)}
						</Button>
					</fetcher.Form>
				)}
			</CardContent>
		</Card>
	)
}
