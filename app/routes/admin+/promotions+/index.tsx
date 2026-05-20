import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const promotions = await prisma.promotion.findMany({
		include: {
			_count: {
				select: { orders: true },
			},
		},
		orderBy: { createdAt: 'desc' },
	})

	return { promotions }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Promotions | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage promotions and coupon codes' },
]

function formatDiscount(type: string, value: number): string {
	if (type === 'PERCENTAGE') {
		return `${(value / 100).toFixed(2)}%`
	}
	return `$${(value / 100).toFixed(2)}`
}

function formatDate(date: string | null): string {
	if (!date) return '—'
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})
}

function isExpired(expiresAt: string | null): boolean {
	if (!expiresAt) return false
	return new Date(expiresAt) < new Date()
}

function isNotStarted(startsAt: string | null): boolean {
	if (!startsAt) return false
	return new Date(startsAt) > new Date()
}

function getStatusBadge(promotion: {
	isActive: boolean
	expiresAt: string | null
	startsAt: string | null
}) {
	if (!promotion.isActive) {
		return <Badge variant="secondary">Inactive</Badge>
	}
	if (isExpired(promotion.expiresAt)) {
		return <Badge variant="destructive">Expired</Badge>
	}
	if (isNotStarted(promotion.startsAt)) {
		return <Badge variant="warning">Scheduled</Badge>
	}
	return <Badge variant="success">Active</Badge>
}

function PromotionRow({
	promotion,
}: {
	promotion: Route.ComponentProps['loaderData']['promotions'][number]
}) {
	const fetcher = useFetcher()

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center space-x-3">
					<div className="flex-1">
						<Link
							to={`/admin/promotions/${promotion.id}`}
							className="font-medium text-primary hover:underline transition-colors duration-200"
							aria-label={`View promotion ${promotion.code}`}
						>
							{promotion.code}
						</Link>
						{promotion.description && (
							<div className="text-sm text-muted-foreground mt-1">
								{promotion.description}
							</div>
						)}
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground hidden md:table-cell">
				<span className="font-mono text-sm">
					{formatDiscount(promotion.type, promotion.value)}
				</span>
			</TableCell>
			<TableCell className="hidden lg:table-cell">
				{getStatusBadge(promotion)}
			</TableCell>
			<TableCell className="text-muted-foreground hidden lg:table-cell">
				{promotion.currentUses}
				{promotion.maxUses ? ` / ${promotion.maxUses}` : ''}
			</TableCell>
			<TableCell className="text-muted-foreground hidden xl:table-cell text-sm">
				{formatDate(promotion.startsAt)}
			</TableCell>
			<TableCell className="text-muted-foreground hidden xl:table-cell text-sm">
				{formatDate(promotion.expiresAt)}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end space-x-1">
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/promotions/${promotion.id}`} aria-label={`View ${promotion.code}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/promotions/${promotion.id}/edit`} aria-label={`Edit ${promotion.code}`}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={`Delete ${promotion.code}`}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Promotion</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete promotion "{promotion.code}"? This action cannot be undone.
									{promotion._count.orders > 0 && (
										<span className="block mt-2 text-destructive">
											This promotion has been used in {promotion._count.orders} orders.
										</span>
									)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<fetcher.Form
									method="POST"
									action={`/admin/promotions/${promotion.id}/delete`}
								>
									<input type="hidden" name="promotionId" value={promotion.id} />
									<AlertDialogAction
										type="submit"
										disabled={fetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{fetcher.state === 'idle' ? 'Delete Promotion' : 'Deleting...'}
									</AlertDialogAction>
								</fetcher.Form>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</TableCell>
		</TableRow>
	)
}

export default function PromotionsList({ loaderData }: Route.ComponentProps) {
	const { promotions } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterStatus, setFilterStatus] = useState('all')

	const filteredPromotions = useMemo(() => {
		let filtered = promotions

		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(p) =>
					p.code.toLowerCase().includes(search) ||
					(p.description && p.description.toLowerCase().includes(search)),
			)
		}

		if (filterStatus === 'active') {
			filtered = filtered.filter(
				(p) =>
					p.isActive &&
					!isExpired(p.expiresAt) &&
					!isNotStarted(p.startsAt),
			)
		} else if (filterStatus === 'inactive') {
			filtered = filtered.filter((p) => !p.isActive)
		} else if (filterStatus === 'expired') {
			filtered = filtered.filter(
				(p) => p.isActive && isExpired(p.expiresAt),
			)
		} else if (filterStatus === 'scheduled') {
			filtered = filtered.filter(
				(p) => p.isActive && isNotStarted(p.startsAt),
			)
		}

		return filtered
	}, [promotions, searchTerm, filterStatus])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Promotions</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage promotions and coupon codes ({promotions.length} promotions)
						{searchTerm || filterStatus !== 'all' ? (
							<span className="ml-2">• {filteredPromotions.length} shown</span>
						) : null}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/promotions/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						Add Promotion
					</Link>
				</Button>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon name="magnifying-glass" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search promotions by code or description..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={filterStatus} onValueChange={setFilterStatus}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Filter by status">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Promotions</SelectItem>
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="scheduled">Scheduled</SelectItem>
							<SelectItem value="expired">Expired</SelectItem>
							<SelectItem value="inactive">Inactive</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Promotions Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">Promotion</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">Discount</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Status</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Uses</TableHead>
							<TableHead className="font-semibold hidden xl:table-cell">Starts</TableHead>
							<TableHead className="font-semibold hidden xl:table-cell">Expires</TableHead>
							<TableHead className="text-right font-semibold">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredPromotions.map((promotion) => (
							<PromotionRow key={promotion.id} promotion={promotion} />
						))}
					</TableBody>
				</Table>
			</Card>

			{promotions.length === 0 && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="tags" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">No promotions yet</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						Get started by creating your first promotion or coupon code.
					</p>
					<Button asChild size="lg" className="h-9 rounded-lg font-medium">
						<Link to="/admin/promotions/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Promotion
						</Link>
					</Button>
				</div>
			)}

			{/* No search results */}
			{promotions.length > 0 && filteredPromotions.length === 0 && (searchTerm || filterStatus !== 'all') && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">No promotions found</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{searchTerm ? (
							<>No promotions match your search for "<strong>{searchTerm}</strong>".</>
						) : (
							<>No promotions match the selected filter.</>
						)}
					</p>
					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Button
							variant="outline"
							onClick={() => {
								setSearchTerm('')
								setFilterStatus('all')
							}}
							className="h-9 rounded-lg font-medium"
						>
							Clear filters
						</Button>
						<Button asChild className="h-9 rounded-lg font-medium">
							<Link to="/admin/promotions/new">
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Promotion
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
