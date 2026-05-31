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

	// Get all shipping zones with method counts
	const zones = await prisma.shippingZone.findMany({
		include: {
			_count: {
				select: { methods: true },
			},
		},
		orderBy: [
			{ displayOrder: 'asc' },
			{ name: 'asc' },
		],
	})

	return { zones }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Shipping Zones | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage shipping zones' },
]

function ZoneRow({ zone }: { zone: Route.ComponentProps['loaderData']['zones'][number] }) {
	const fetcher = useFetcher()
	const countries = zone.countries as string[]
	const countryCount = Array.isArray(countries) ? countries.length : 0

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center space-x-3">
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<Link
								to={`/admin/shipping/zones/${zone.id}`}
								className="font-medium text-primary hover:underline transition-colors duration-200"
								aria-label={`View ${zone.name} zone`}
							>
								{zone.name}
							</Link>
							{!zone.isActive && (
								<Badge variant="secondary" className="text-xs">
									Inactive
								</Badge>
							)}
						</div>
						{zone.description && (
							<div className="text-sm text-muted-foreground mt-1">
								{zone.description}
							</div>
						)}
						{/* Mobile-only info */}
						<div className="md:hidden mt-2 flex flex-wrap gap-2">
							<Badge variant="outline" className="text-xs">
								{countryCount} {countryCount === 1 ? 'country' : 'countries'}
							</Badge>
							<Badge variant="default" className="text-xs">
								{zone._count.methods} {zone._count.methods === 1 ? 'method' : 'methods'}
							</Badge>
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground hidden md:table-cell">
				{countryCount > 0 ? (
					<div className="flex flex-wrap gap-1">
						{countries.slice(0, 5).map((country) => (
							<Badge key={country} variant="outline" className="text-xs">
								{country}
							</Badge>
						))}
						{countryCount > 5 && (
							<Badge variant="outline" className="text-xs">
								+{countryCount - 5}
							</Badge>
						)}
					</div>
				) : (
					<span className="text-muted-foreground">All countries</span>
				)}
			</TableCell>
			<TableCell className="font-medium hidden lg:table-cell">
				<Badge variant="default" className="text-xs">
					{zone._count.methods} {zone._count.methods === 1 ? 'method' : 'methods'}
				</Badge>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end space-x-1">
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/shipping/zones/${zone.id}`} aria-label={`View ${zone.name}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/shipping/zones/${zone.id}/edit`} aria-label={`Edit ${zone.name}`}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={`Delete ${zone.name}`}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Shipping Zone</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete "{zone.name}"? This action cannot be undone.
									{zone._count.methods > 0 && (
										<span className="block mt-2 text-destructive">
											This zone has {zone._count.methods} shipping method{zone._count.methods === 1 ? '' : 's'} that will also be deleted.
										</span>
									)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<fetcher.Form
									method="POST"
									action={`/admin/shipping/zones/${zone.id}/delete`}
								>
									<input type="hidden" name="zoneId" value={zone.id} />
									<AlertDialogAction
										type="submit"
										disabled={fetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{fetcher.state === 'idle' ? 'Delete Zone' : 'Deleting...'}
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
