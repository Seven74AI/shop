import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$promotionId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const promotion = await prisma.promotion.findUnique({
		where: { id: params.promotionId },
		include: {
			_count: {
				select: { orders: true },
			},
		},
	})

	invariantResponse(promotion, 'Promotion not found', { status: 404 })

	return { promotion }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.promotion.code} | Promotions | Admin | Epic Shop` },
	{ name: 'description', content: `View promotion: ${loaderData?.promotion.code}` },
]

function formatDiscount(type: string, value: number): string {
	if (type === 'PERCENTAGE') {
		return `${(value / 100).toFixed(2)}%`
	}
	return `$${(value / 100).toFixed(2)}`
}

function formatDate(date: string | null): string {
	if (!date) return '—'
	return new Date(date).toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function getStatusBadge(promotion: {
	isActive: boolean
	expiresAt: string | null
	startsAt: string | null
}) {
	if (!promotion.isActive) {
		return <Badge variant="secondary">Inactive</Badge>
	}
	if (promotion.expiresAt && new Date(promotion.expiresAt) < new Date()) {
		return <Badge variant="destructive">Expired</Badge>
	}
	if (promotion.startsAt && new Date(promotion.startsAt) > new Date()) {
		return <Badge variant="warning">Scheduled</Badge>
	}
	return <Badge variant="success">Active</Badge>
}

export default function PromotionView({ loaderData }: Route.ComponentProps) {
	const { promotion } = loaderData

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-normal tracking-tight text-foreground font-mono">
							{promotion.code}
						</h1>
						{getStatusBadge(promotion)}
					</div>
					<p className="text-sm text-muted-foreground">
						{promotion.description || 'No description provided'}
					</p>
				</div>
				<div className="flex items-center space-x-3">
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<Link to="/admin/promotions">
							<Icon name="arrow-left" className="mr-2 h-4 w-4" />
							Back to Promotions
						</Link>
					</Button>
					<Button asChild className="h-9 rounded-lg font-medium">
						<Link to={`/admin/promotions/${promotion.id}/edit`}>
							<Icon name="pencil-1" className="mr-2 h-4 w-4" />
							Edit Promotion
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Promotion Information */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Promotion Details</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Code</label>
								<p className="text-lg font-mono mt-1 font-medium">{promotion.code}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Description</label>
								<p className="text-sm mt-1">
									{promotion.description || (
										<span className="text-muted-foreground italic">No description provided</span>
									)}
								</p>
							</div>
							<div className="grid grid-cols-2 gap-6">
								<div>
									<label className="text-sm font-medium text-muted-foreground">Type</label>
									<p className="text-lg mt-1">
										{promotion.type === 'PERCENTAGE' ? 'Percentage' : 'Fixed Amount'}
									</p>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Discount</label>
									<p className="text-lg font-semibold mt-1">
										{formatDiscount(promotion.type, promotion.value)}
									</p>
								</div>
							</div>
							{promotion.minOrderAmount != null && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">
										Minimum Order
									</label>
									<p className="text-lg mt-1">
										${(promotion.minOrderAmount / 100).toFixed(2)}
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Schedule Information */}
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Schedule</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid grid-cols-2 gap-6">
								<div>
									<label className="text-sm font-medium text-muted-foreground">Starts</label>
									<p className="text-lg mt-1">{formatDate(promotion.startsAt)}</p>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Expires</label>
									<p className="text-lg mt-1">{formatDate(promotion.expiresAt)}</p>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Status</label>
								<div className="mt-1">{getStatusBadge(promotion)}</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Usage Statistics */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Usage Statistics</h2>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-6">
								<div className="text-center p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10">
									<div className="text-3xl font-bold text-primary mb-1">
										{promotion.currentUses}
									</div>
									<div className="text-sm text-muted-foreground font-medium">
										Current Uses
									</div>
								</div>
								<div className="text-center p-4 rounded-lg bg-gradient-to-br from-secondary/5 to-secondary/10">
									<div className="text-3xl font-bold text-secondary-foreground mb-1">
										{promotion.maxUses ?? '∞'}
									</div>
									<div className="text-sm text-muted-foreground font-medium">
										Max Uses
									</div>
								</div>
								<div className="text-center p-4 rounded-lg bg-gradient-to-br from-accent/5 to-accent/10">
									<div className="text-3xl font-bold text-accent-foreground mb-1">
										{promotion.maxUsesPerUser ?? '∞'}
									</div>
									<div className="text-sm text-muted-foreground font-medium">
										Max Per User
									</div>
								</div>
								<div className="text-center p-4 rounded-lg bg-gradient-to-br from-green-500/5 to-green-500/10">
									<div className="text-3xl font-bold text-green-600 mb-1">
										{promotion._count.orders}
									</div>
									<div className="text-sm text-muted-foreground font-medium">
										Orders
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Metadata */}
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Metadata</h2>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Created</label>
								<p className="text-sm mt-1">{formatDate(promotion.createdAt)}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Last Updated</label>
								<p className="text-sm mt-1">{formatDate(promotion.updatedAt)}</p>
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
			<Icon name="question-mark-circled" className="h-12 w-12 text-muted-foreground" />
			<h2 className="text-xl font-semibold">Promotion not found</h2>
			<p className="text-muted-foreground text-center">
				The promotion you're looking for doesn't exist or has been deleted.
			</p>
			<Button asChild>
				<Link to="/admin/promotions">
					<Icon name="arrow-left" className="mr-2 h-4 w-4" />
					Back to Promotions
				</Link>
			</Button>
		</div>
	)
}
