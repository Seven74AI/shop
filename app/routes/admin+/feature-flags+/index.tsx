import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
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

function FlagRow({ flag, t }: { flag: Route.ComponentProps['loaderData']['flags'][number]; t: ReturnType<typeof import('#app/utils/i18n.tsx').useTranslation>['t'] }) {
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
								aria-label={t('admin.flags.edit', { key: flag.key })}
							>
								{flag.key}
							</Link>
							{isEnabled ? (
								<Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
									{t('admin.flags.status.enabled')}
								</Badge>
							) : (
								<Badge variant="secondary" className="text-xs">
									{t('admin.flags.status.disabled')}
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
							{t('admin.flags.audience')}
						</Badge>
					)}
					{!hasRollout && !hasAudience && (
						<span className="text-sm text-muted-foreground">{t('admin.flags.global')}</span>
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
							aria-label={isEnabled ? t('admin.flags.disable', { key: flag.key }) : t('admin.flags.enable', { key: flag.key })}
							disabled={toggleFetcher.state !== 'idle'}
						>
							{isEnabled ? t('admin.flags.status.enabled') : t('admin.flags.status.disabled')}
						</Button>
					</toggleFetcher.Form>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/feature-flags/${flag.key}/edit`} aria-label={t('admin.flags.edit', { key: flag.key })}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={t('admin.flags.delete', { key: flag.key })}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{t('admin.flags.deleteTitle')}</AlertDialogTitle>
								<AlertDialogDescription>
									{t('admin.flags.deleteDescription', { key: flag.key })}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t('admin.flags.cancel')}</AlertDialogCancel>
								<toggleFetcher.Form
									method="POST"
									action={`/admin/feature-flags/${flag.key}/delete`}
								>
									<AlertDialogAction
										type="submit"
										disabled={toggleFetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{toggleFetcher.state === 'idle' ? t('admin.flags.deleteAction') : t('admin.flags.deleting')}
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

export default function FeatureFlagsList({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const { flags } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled'>('all')

	const filteredFlags = useMemo(() => {
		let filtered = flags

		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(flag) =>
					flag.key.toLowerCase().includes(search) ||
					(flag.description && flag.description.toLowerCase().includes(search)),
			)
		}

		if (filterStatus === 'enabled') {
			filtered = filtered.filter((flag) => flag.enabled)
		} else if (filterStatus === 'disabled') {
			filtered = filtered.filter((flag) => !flag.enabled)
		}

		return filtered
	}, [flags, searchTerm, filterStatus])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						{t('admin.flags.title')}
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{t('admin.flags.manageDescription', { count: flags.length, plural: flags.length === 1 ? '' : 's' })}
						{searchTerm || filterStatus !== 'all' ? (
							<span className="ml-2">• {t('admin.flags.shown', { count: filteredFlags.length })}</span>
						) : null}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/feature-flags/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						{t('admin.flags.addFlag')}
					</Link>
				</Button>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder={t('admin.flags.searchPlaceholder')}
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as typeof filterStatus)}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder={t('admin.flags.filter.all')} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">{t('admin.flags.filter.all')}</SelectItem>
							<SelectItem value="enabled">{t('admin.flags.filter.enabled')}</SelectItem>
							<SelectItem value="disabled">{t('admin.flags.filter.disabled')}</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Flags Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">{t('admin.flags.table.flag')}</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">{t('admin.flags.table.targeting')}</TableHead>
							<TableHead className="text-right font-semibold">{t('admin.flags.table.actions')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredFlags.map((flag) => (
							<FlagRow key={flag.key} flag={flag} t={t} />
						))}
					</TableBody>
				</Table>
			</Card>

			{flags.length === 0 && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="settings" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">{t('admin.flags.empty.title')}</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{t('admin.flags.empty.description')}
					</p>
					<Button asChild size="lg" className="h-9 rounded-lg font-medium">
						<Link to="/admin/feature-flags/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Flag
						</Link>
					</Button>
				</div>
			)}

			{/* No search results */}
			{flags.length > 0 && filteredFlags.length === 0 && (searchTerm || filterStatus !== 'all') && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">{t('admin.flags.noResults.title')}</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{searchTerm ? (
							<>
								{t('admin.flags.noResults.searchMatch', { search: searchTerm })}
							</>
						) : (
							<>{t('admin.flags.noResults.filterMatch')}</>
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
							{t('admin.flags.clearFilters')}
						</Button>
						<Button asChild className="h-9 rounded-lg font-medium">
							<Link to="/admin/feature-flags/new">
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Flag
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
