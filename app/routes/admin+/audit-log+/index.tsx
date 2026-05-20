import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
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
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const auditLogs = await prisma.auditLog.findMany({
		orderBy: { createdAt: 'desc' },
	})

	return { auditLogs }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Audit Log | Admin | Epic Shop' },
	{ name: 'description', content: 'View audit log entries for admin actions' },
]

const ITEMS_PER_PAGE = 25

export default function AuditLogList({ loaderData }: Route.ComponentProps) {
	const { auditLogs } = loaderData

	const [searchTerm, setSearchTerm] = useState('')
	const [entityTypeFilter, setEntityTypeFilter] = useState('all')
	const [currentPage, setCurrentPage] = useState(1)

	// Get unique entity types for the filter dropdown
	const entityTypes = useMemo(() => {
		const types = new Set(auditLogs.map((log) => log.entityType))
		return Array.from(types).sort()
	}, [auditLogs])

	// Filter audit logs based on search and filter criteria
	const filteredLogs = useMemo(() => {
		let filtered = auditLogs

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(log) =>
					log.action.toLowerCase().includes(search) ||
					log.entityType.toLowerCase().includes(search) ||
					log.entityId.toLowerCase().includes(search) ||
					log.actorEmail?.toLowerCase().includes(search) ||
					log.actorUserId?.toLowerCase().includes(search) ||
					log.requestId?.toLowerCase().includes(search),
			)
		}

		// Apply entity type filter
		if (entityTypeFilter !== 'all') {
			filtered = filtered.filter((log) => log.entityType === entityTypeFilter)
		}

		return filtered
	}, [auditLogs, searchTerm, entityTypeFilter])

	// Pagination calculations
	const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const endIndex = startIndex + ITEMS_PER_PAGE
	const paginatedLogs = filteredLogs.slice(startIndex, endIndex)

	// Reset to page 1 when filters change
	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, entityTypeFilter])

	// Memoize entity type options
	const entityTypeOptions = useMemo(
		() =>
			entityTypes.map((type) => (
				<SelectItem key={type} value={type}>
					{type}
				</SelectItem>
			)),
		[entityTypes],
	)

	// Format timestamp for display
	const formatDate = (date: Date | string) => {
		const d = new Date(date)
		return d.toLocaleString()
	}

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Audit Log
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						View audit trail for admin actions ({auditLogs.length} total)
						{searchTerm.trim() || entityTypeFilter !== 'all'
							? ` • ${filteredLogs.length} shown`
							: ''}
					</p>
				</div>
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
							placeholder="Search by action, entity, actor, or request ID..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by entity type"
						>
							<SelectValue placeholder="Filter by entity" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Entities</SelectItem>
							{entityTypeOptions}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Action</TableHead>
						<TableHead>Entity</TableHead>
						<TableHead className="hidden md:table-cell">Entity ID</TableHead>
						<TableHead className="hidden lg:table-cell">Actor</TableHead>
						<TableHead className="hidden md:table-cell">Timestamp</TableHead>
						<TableHead>Details</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredLogs.length === 0 ? (
						<TableRow>
							<TableCell colSpan={6} className="text-center py-8">
								{searchTerm.trim() || entityTypeFilter !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon
											name="magnifying-glass"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No audit logs match your search criteria.</p>
										<p className="text-sm">
											Try adjusting your search or filters.
										</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon
											name="clock"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No audit logs found.</p>
										<p className="text-sm">
											Audit entries will appear here when admin actions
											are performed.
										</p>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						paginatedLogs.map((log) => (
							<TableRow
								key={log.id}
								className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
							>
								<TableCell>
									<Badge variant="outline" className="font-mono text-xs">
										{log.action}
									</Badge>
								</TableCell>
								<TableCell>
									<span className="font-medium">{log.entityType}</span>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground font-mono text-xs">
										{log.entityId}
									</span>
								</TableCell>
								<TableCell className="hidden lg:table-cell">
									{log.actorEmail ? (
										<span className="text-muted-foreground">
											{log.actorEmail}
										</span>
									) : log.actorUserId ? (
										<span className="text-muted-foreground font-mono text-xs">
											{log.actorUserId.slice(0, 8)}...
										</span>
									) : (
										<span className="text-muted-foreground italic">
											System
										</span>
									)}
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground text-sm">
										{formatDate(log.createdAt)}
									</span>
								</TableCell>
								<TableCell>
									<Button variant="ghost" size="sm" asChild>
										<Link
											to={`/admin/audit-log/${log.id}`}
											aria-label={`View audit log details for ${log.action}`}
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
						Showing {startIndex + 1} to{' '}
						{Math.min(endIndex, filteredLogs.length)} of{' '}
						{filteredLogs.length} entries
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
						>
							<Icon name="arrow-left" className="h-4 w-4" />
							Previous
						</Button>
						<div className="flex items-center gap-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(page) =>
										page === 1 ||
										page === totalPages ||
										Math.abs(page - currentPage) <= 1,
								)
								.map((page, index, arr) => (
									<div key={page} className="flex items-center gap-1">
										{index > 0 && arr[index - 1] !== page - 1 && (
											<span className="px-2 text-muted-foreground">
												...
											</span>
										)}
										<Button
											variant={
												currentPage === page ? 'default' : 'outline'
											}
											size="sm"
											onClick={() => setCurrentPage(page)}
											className="min-w-[2.5rem]"
										>
											{page}
										</Button>
									</div>
								))}
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === totalPages}
							onClick={() =>
								setCurrentPage((p) => Math.min(totalPages, p + 1))
							}
						>
							Next
							<Icon name="arrow-right" className="h-4 w-4" />
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
