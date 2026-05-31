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

	const flags = await prisma.flag.findMany({
		orderBy: [{ key: 'asc' }],
	})

	return { flags }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Feature Flags | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage feature flags for progressive rollout' },
]

function FlagRow({ flag }: { flag: Route.ComponentProps['loaderData']['flags'][number] }) {
	const toggleFetcher = useFetcher()

	// Parse audience for display
	let audienceParsed: Record<string, unknown> | null = null
	if (flag.audience) {
		try {
			audienceParsed = JSON.parse(flag.audience) as Record<string, unknown>
		} catch {
			// Invalid JSON — display as-is
		}
	}

	const hasAudience =
		audienceParsed &&
		((Array.isArray(audienceParsed.userIds) && audienceParsed.userIds.length > 0) ||
			(Array.isArray(audienceParsed.countries) && audienceParsed.countries.length > 0) ||
			(Array.isArray(audienceParsed.roles) && audienceParsed.roles.length > 0))

	const hasRollout =
		flag.rolloutPercentage !== null &&
		flag.rolloutPercentage !== undefined &&
		flag.rolloutPercentage > 0 &&
		flag.rolloutPercentage < 100

	const isEnabled = flag.enabled

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center space-x-3">
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<Link
								to={`/admin/feature-flags/${flag.key}/edit`}
								className="font-mono font-medium text-primary hover:underline transition-colors duration-200"
								aria-label={`Edit ${flag.key}`}
							>
								{flag.key}
							</Link>
							{isEnabled ? (
								<Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
									Enabled
								</Badge>
							) : (
								<Badge variant="secondary" className="text-xs">
									Disabled
								</Badge>
							)}
						</div>
						{flag.description && (
							<div className="text-sm text-muted-foreground mt-1">{flag.description}</div>
						)}
					</div>
				</div>
			</TableCell>
			<TableCell className="hidden md:table-cell">
				<div className="flex flex-wrap gap-1">
					{hasRollout && (
						<Badge variant="outline" className="text-xs">
							{flag.rolloutPercentage}%
						</Badge>
					)}
					{hasAudience && (
						<Badge variant="outline" className="text-xs">
							Audience
						</Badge>
					)}
					{!hasRollout && !hasAudience && (
						<span className="text-sm text-muted-foreground">Global</span>
					)}
				</div>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end space-x-1">
					{/* Quick toggle */}
					<toggleFetcher.Form method="POST" action={`/admin/feature-flags/${flag.key}/toggle`}>
						<Button
							type="submit"
							variant={isEnabled ? 'default' : 'secondary'}
							size="sm"
							className="transition-colors duration-200"
							aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${flag.key}`}
							disabled={toggleFetcher.state !== 'idle'}
						>
							{isEnabled ? 'Enabled' : 'Disabled'}
						</Button>
					</toggleFetcher.Form>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/feature-flags/${flag.key}/edit`} aria-label={`Edit ${flag.key}`}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={`Delete ${flag.key}`}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Feature Flag</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete the flag "{flag.key}"? This action cannot be
									undone. Any routes gated behind this flag will immediately become accessible.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<toggleFetcher.Form
									method="POST"
									action={`/admin/feature-flags/${flag.key}/delete`}
								>
									<AlertDialogAction
										type="submit"
										disabled={toggleFetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{toggleFetcher.state === 'idle' ? 'Delete Flag' : 'Deleting...'}
									</AlertDialogAction>
								</toggleFetcher.Form>
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
