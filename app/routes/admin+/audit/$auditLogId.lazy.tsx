import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import type { loader } from './$auditLogId.ts'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'

export default function AuditDetail({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
	const { entry } = loaderData

	const changes = entry.changes as Record<string, { before: unknown; after: unknown }> | null

	const userName =
		entry.user?.name || entry.user?.username || entry.user?.email || null

	return (
		<div className="space-y-6 animate-slide-top">
			{/* Back link */}
			<div>
				<Button variant="ghost" size="sm" asChild className="mb-4">
					<Link to="/admin/audit">
						<Icon name="arrow-left" className="mr-2 h-4 w-4" />
						Back to Audit Log
					</Link>
				</Button>
			</div>

			{/* Header */}
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					Audit Entry
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{entry.action} on {entry.entityType}
				</p>
			</div>

			{/* Key Details Card */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-lg font-normal">Details</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Entry ID
							</dt>
							<dd className="mt-1 text-sm font-mono">{entry.id}</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Timestamp
							</dt>
							<dd className="mt-1 text-sm">
								{new Date(entry.createdAt).toLocaleString()}
							</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Action
							</dt>
							<dd className="mt-1">
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
							</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								User
							</dt>
							<dd className="mt-1 text-sm">
								{userName ? (
									<Link
										to={`/admin/users/${entry.userId}`}
										className="text-primary hover:underline"
									>
										{userName}
									</Link>
								) : (
									<span className="text-muted-foreground italic">System</span>
								)}
							</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Entity Type
							</dt>
							<dd className="mt-1 text-sm">{entry.entityType}</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Entity ID
							</dt>
							<dd className="mt-1 text-sm font-mono">{entry.entityId}</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								IP Address
							</dt>
							<dd className="mt-1 text-sm font-mono">
								{entry.ipAddress || '—'}
							</dd>
						</div>
						<div>
							<dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								User Agent
							</dt>
							<dd className="mt-1 text-xs text-muted-foreground max-w-xs truncate">
								{entry.userAgent || '—'}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			{/* Changes Card */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-lg font-normal">Changes</CardTitle>
				</CardHeader>
				<CardContent>
					{changes && Object.keys(changes).length > 0 ? (
						<div className="space-y-3">
							{Object.entries(changes).map(([field, diff]) => (
								<div
									key={field}
									className="rounded-lg border p-4 bg-muted/30"
								>
									<div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
										{field}
									</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<div>
											<div className="text-xs text-muted-foreground mb-1">
												Before
											</div>
											<div className="text-sm font-mono bg-red-50 dark:bg-red-950/20 rounded p-2 border border-red-200 dark:border-red-800/30 break-all">
												{diff.before === undefined
													? (
														<span className="text-muted-foreground italic">
															(none)
														</span>
													)
													: diff.before === null
														? (
															<span className="text-muted-foreground italic">
																null
															</span>
														)
													: typeof diff.before === 'object'
														? JSON.stringify(diff.before, null, 2)
														: String(diff.before)}
											</div>
										</div>
										<div>
											<div className="text-xs text-muted-foreground mb-1">
												After
											</div>
											<div className="text-sm font-mono bg-green-50 dark:bg-green-950/20 rounded p-2 border border-green-200 dark:border-green-800/30 break-all">
												{diff.after === undefined
													? (
														<span className="text-muted-foreground italic">
															(none)
														</span>
													)
													: diff.after === null
														? (
															<span className="text-muted-foreground italic">
																null
															</span>
														)
													: typeof diff.after === 'object'
														? JSON.stringify(diff.after, null, 2)
														: String(diff.after)}
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-8 text-muted-foreground">
							<Icon
								name="question-mark-circled"
								className="h-8 w-8 mx-auto mb-2 opacity-50"
							/>
							<p>No changes recorded for this entry.</p>
							<p className="text-sm">
								{entry.action === 'LOGIN' || entry.action === 'LOGOUT'
									? 'Authentication events typically do not record field-level changes.'
									: entry.action === 'DELETE'
										? 'The entity was deleted.'
										: ''}
							</p>
						</div>
					)}
				</CardContent>
			</Card>
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
				404: () => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon
							name="magnifying-glass"
							className="h-12 w-12 text-muted-foreground"
						/>
						<h2 className="text-xl font-semibold">Not Found</h2>
						<p className="text-muted-foreground text-center">
							This audit log entry does not exist.
						</p>
						<Button asChild>
							<Link to="/admin/audit">Back to Audit Log</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
