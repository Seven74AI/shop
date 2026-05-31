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
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all shipping methods with related data
	const methods = await prisma.shippingMethod.findMany({
		include: {
			carrier: {
				select: {
					id: true,
					name: true,
					displayName: true,
				},
			},
			zone: {
				select: {
					id: true,
					name: true,
				},
			},
			_count: {
				select: { orders: true },
			},
		},
		orderBy: [
			{ zone: { displayOrder: 'asc' } },
			{ displayOrder: 'asc' },
			{ name: 'asc' },
		],
	})

	const currency = await getStoreCurrency()

	return { methods, currency }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Shipping Methods | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage shipping methods' },
]

function MethodRow({
	method,
	currency,
}: {
	method: Route.ComponentProps['loaderData']['methods'][number]
	currency: Route.ComponentProps['loaderData']['currency']
}) {
	const fetcher = useFetcher()

	let costDisplay = '—'
	if (method.rateType === 'FLAT' && method.flatRate !== null) {
		costDisplay = formatPrice(method.flatRate, currency)
	} else if (method.rateType === 'FREE') {
		costDisplay = method.freeShippingThreshold
			? `Free over ${formatPrice(method.freeShippingThreshold, currency)}`
			: 'Free'
	} else if (method.rateType === 'PRICE_BASED') {
		costDisplay = 'Price-based'
	} else if (method.rateType === 'WEIGHT_BASED') {
		costDisplay = 'Weight-based'
	}

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center space-x-3">
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<Link
								to={`/admin/shipping/methods/${method.id}`}
								className="font-medium text-primary hover:underline transition-colors duration-200"
								aria-label={`View ${method.name} method`}
							>
								{method.name}
							</Link>
							{!method.isActive && (
								<Badge variant="secondary" className="text-xs">
									Inactive
								</Badge>
							)}
						</div>
						{method.description && (
							<div className="text-sm text-muted-foreground mt-1">{method.description}</div>
						)}
						{/* Mobile-only info */}
						<div className="md:hidden mt-2 flex flex-wrap gap-2">
							<Badge variant="outline" className="text-xs">
								{method.zone.name}
							</Badge>
							{method.carrier && (
								<Badge variant="outline" className="text-xs">
									{method.carrier.displayName}
								</Badge>
							)}
							<Badge variant="secondary" className="text-xs">
								{method.rateType.replace('_', ' ')}
							</Badge>
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground hidden md:table-cell">
				<Link
					to={`/admin/shipping/zones/${method.zone.id}`}
					className="text-primary hover:underline"
				>
					{method.zone.name}
				</Link>
			</TableCell>
			<TableCell className="text-muted-foreground hidden lg:table-cell">
				{method.carrier ? (
					<Badge variant="outline">{method.carrier.displayName}</Badge>
				) : (
					<span className="text-muted-foreground">Generic</span>
				)}
			</TableCell>
			<TableCell className="hidden lg:table-cell">
				<Badge variant="secondary" className="text-xs">
					{method.rateType.replace('_', ' ')}
				</Badge>
			</TableCell>
			<TableCell className="font-medium hidden lg:table-cell">{costDisplay}</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end space-x-1">
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/shipping/methods/${method.id}`} aria-label={`View ${method.name}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link
							to={`/admin/shipping/methods/${method.id}/edit`}
							aria-label={`Edit ${method.name}`}
						>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={`Delete ${method.name}`}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Shipping Method</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete "{method.name}"? This action cannot be undone.
									{method._count.orders > 0 && (
										<span className="block mt-2 text-destructive">
											This method has been used in {method._count.orders} order
											{method._count.orders === 1 ? '' : 's'}. Historical order data will be
											preserved.
										</span>
									)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<fetcher.Form method="POST" action={`/admin/shipping/methods/${method.id}/delete`}>
									<input type="hidden" name="methodId" value={method.id} />
									<AlertDialogAction
										type="submit"
										disabled={fetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{fetcher.state === 'idle' ? 'Delete Method' : 'Deleting...'}
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

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
