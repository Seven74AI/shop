import { useCallback } from 'react'
import { Form, Link, useSearchParams } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
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
import { type Route } from './+types/index.ts'

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'] as const

const AuditSearchSchema = z.object({
	q: z.string().optional(),
	action: z.enum(ACTIONS).optional(),
	entityType: z.string().optional(),
	userId: z.string().optional(),
	page: z.coerce.number().int().positive().default(1),
	perPage: z.coerce.number().int().positive().max(100).default(30),
	from: z.string().optional(),
	to: z.string().optional(),
})

export default function AuditIndex({ loaderData }: Route.ComponentProps) {
	const {
		auditLogs,
		page,
		totalPages,
		total,
		entityTypes,
		filters,
	} = loaderData

	const [searchParams, setSearchParams] = useSearchParams()

	const buildPageUrl = useCallback(
		(pageNum: number) => {
			const params = new URLSearchParams(searchParams)
			params.set('page', String(pageNum))
			return `?${params.toString()}`
		},
		[searchParams],
	)

	const updateFilter = useCallback(
		(key: string, value: string) => {
			const params = new URLSearchParams(searchParams)
			if (value) {
				params.set(key, value)
			} else {
				params.delete(key)
			}
			params.delete('page') // reset to page 1
			setSearchParams(params, { replace: true })
		},
		[searchParams, setSearchParams],
	)

	const clearFilters = useCallback(() => {
		setSearchParams({}, { replace: true })
	}, [setSearchParams])

	const hasActiveFilters =
		filters?.action || filters?.entityType || filters?.userId || filters?.q || filters?.from || filters?.to

	return (
		<div className="space-y-6 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Audit Log
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{total} audit {total === 1 ? 'entry' : 'entries'}
						{hasActiveFilters ? ' (filtered)' : ''}
					</p>
				</div>
				<Button variant="outline" size="sm" asChild>
					<Link to="/admin/audit/export" reloadDocument>
						<Icon name="download" className="mr-2 h-4 w-4" />
						Export CSV
					</Link>
				</Button>
			</div>

			{/* Filter Controls */}
			<Form method="get" className="space-y-4">
				<div className="flex flex-wrap gap-3">
					{/* Search */}
					<div className="flex-1 min-w-[200px]">
						<div className="relative">
							<Icon
								name="magnifying-glass"
								className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
							/>
							<Input
								placeholder="Search entity type or ID..."
								name="q"
								defaultValue={filters?.q ?? ''}
								className="pl-10"
								onChange={(e) => {
									if (!e.target.value) updateFilter('q', '')
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										updateFilter('q', (e.target as HTMLInputElement).value)
									}
								}}
							/>
						</div>
					</div>

					{/* Action Filter */}
					<div className="w-40">
						<Select
							name="action"
							value={filters?.action ?? 'all'}
							onValueChange={(v) => updateFilter('action', v === 'all' ? '' : v)}
						>
							<SelectTrigger aria-label="Filter by action">
								<SelectValue placeholder="All Actions" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Actions</SelectItem>
								{ACTIONS.map((a) => (
									<SelectItem key={a} value={a}>
										{a}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Entity Type Filter */}
					<div className="w-48">
						<Select
							name="entityType"
							value={filters?.entityType ?? 'all'}
							onValueChange={(v) => updateFilter('entityType', v === 'all' ? '' : v)}
						>
							<SelectTrigger aria-label="Filter by entity type">
								<SelectValue placeholder="All Entities" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Entities</SelectItem>
								{entityTypes.map((et) => (
									<SelectItem key={et} value={et}>
										{et}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Date From */}
					<div className="w-36">
						<Input
							type="date"
							name="from"
							defaultValue={filters?.from ?? ''}
							placeholder="From"
							className="h-9"
							onChange={(e) => updateFilter('from', e.target.value)}
						/>
					</div>

					{/* Date To */}
					<div className="w-36">
						<Input
							type="date"
							name="to"
							defaultValue={filters?.to ?? ''}
							placeholder="To"
							className="h-9"
							onChange={(e) => updateFilter('to', e.target.value)}
						/>
					</div>

					{/* Clear Filters */}
					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={clearFilters}
							className="h-9"
						>
							<Icon name="cross-1" className="mr-1 h-3 w-3" />
							Clear
						</Button>
					)}
				</div>
			</Form>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date</TableHead>
						<TableHead className="hidden md:table-cell">User</TableHead>
						<TableHead>Action</TableHead>
						<TableHead className="hidden sm:table-cell">Entity</TableHead>
						<TableHead className="hidden lg:table-cell">Entity ID</TableHead>
						<TableHead className="hidden lg:table-cell">IP</TableHead>
						<TableHead>Details</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{auditLogs.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} className="text-center py-8">
								<div className="text-muted-foreground">
									<Icon
										name="magnifying-glass"
										className="h-8 w-8 mx-auto mb-2 opacity-50"
									/>
									<p>No audit entries found.</p>
									{hasActiveFilters && (
										<p className="text-sm mt-1">
											Try adjusting your filters.
										</p>
									)}
								</div>
							</TableCell>
						</TableRow>
					) : (
						auditLogs.map((entry) => (
							<TableRow
								key={entry.id}
								className="transition-colors duration-150 hover:bg-muted/50"
							>
								<TableCell className="text-xs whitespace-nowrap">
									{new Date(entry.createdAt).toLocaleString()}
								</TableCell>
								<TableCell className="hidden md:table-cell">
									{entry.user ? (
										<span className="text-xs">
											{entry.user.name ||
												entry.user.username ||
												entry.user.email}
										</span>
									) : (
										<span className="text-xs text-muted-foreground italic">
											System
										</span>
									)}
								</TableCell>
								<TableCell>
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
											entry.action === 'DELETE'
												? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
												: entry.action === 'CREATE'
													? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
													: entry.action === 'UPDATE'
														? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
														: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
										}`}
									>
										{entry.action}
									</span>
								</TableCell>
								<TableCell className="hidden sm:table-cell text-xs">
									{entry.entityType}
								</TableCell>
								<TableCell className="hidden lg:table-cell text-xs font-mono max-w-[120px] truncate">
									{entry.entityId}
								</TableCell>
								<TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
									{entry.ipAddress || '—'}
								</TableCell>
								<TableCell>
									<Button variant="ghost" size="sm" asChild>
										<Link
											to={`/admin/audit/${entry.id}`}
											aria-label={`View audit entry ${entry.id}`}
										>
											<Icon
												name="eye-open"
												className="h-4 w-4"
												aria-hidden="true"
											/>
										</Link>
									</Button>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Page {page} of {totalPages} ({total} total)
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							asChild
						>
							<Link to={buildPageUrl(page - 1)}>
								<Icon name="arrow-left" className="h-4 w-4" />
								Previous
							</Link>
						</Button>
						<div className="flex items-center gap-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(p) =>
										p === 1 ||
										p === totalPages ||
										Math.abs(p - page) <= 1,
								)
								.map((p, idx, arr) => (
									<div key={p} className="flex items-center gap-1">
										{idx > 0 &&
											arr[idx - 1] !== p - 1 && (
												<span className="px-2 text-muted-foreground">
													...
												</span>
											)}
										<Button
											variant={
												p === page ? 'default' : 'outline'
											}
											size="sm"
											className="min-w-[2.5rem]"
											asChild
										>
											<Link to={buildPageUrl(p)}>{p}</Link>
										</Button>
									</div>
								))}
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages}
							asChild
						>
							<Link to={buildPageUrl(page + 1)}>
								Next
								<Icon name="arrow-right" className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon
							name="lock-closed"
							className="h-12 w-12 text-muted-foreground"
						/>
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' &&
							error.data &&
							'message' in error.data
								? String(error.data.message)
								: 'You do not have permission to access this page.'}
						</p>
						<Button asChild>
							<Link to="/admin">Back to Dashboard</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
