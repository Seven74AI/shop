import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from '#app/components/ui/table.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$logId.ts'

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const log = await prisma.auditLog.findUnique({
		where: { id: params.logId },
	})

	if (!log) {
		throw new Response('Audit log entry not found', { status: 404 })
	}

	return { auditLog: log }
}

export const meta: Route.MetaFunction = ({ data }) => [
	{ title: `Audit Log Detail | Admin | Epic Shop` },
	{
		name: 'description',
		content: `Details for audit log entry`,
	},
]

export default function AuditLogDetail({
	loaderData,
}: Route.ComponentProps) {
	const { auditLog: log } = loaderData

	const formatDate = (date: Date | string) => {
		const d = new Date(date)
		return d.toLocaleString()
	}

	const renderJsonValue = (value: unknown) => {
		if (value === null || value === undefined) {
			return <span className="text-muted-foreground italic">No data</span>
		}
		if (typeof value === 'object') {
			return (
				<pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
					{JSON.stringify(value, null, 2)}
				</pre>
			)
		}
		return <span>{String(value)}</span>
	}

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with back navigation */}
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/admin/audit-log" aria-label="Back to audit log list">
						<Icon
							name="arrow-left"
							className="h-4 w-4 mr-1"
							aria-hidden="true"
						/>
						Back
					</Link>
				</Button>
			</div>

			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					Audit Log Entry
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Details for audit log entry {log.id}
				</p>
			</div>

			{/* Summary Card */}
			<div className="rounded-lg border bg-card">
				<div className="p-6">
					<h2 className="text-base font-medium text-foreground mb-4">
						Summary
					</h2>
					<Table>
						<TableBody>
							<TableRow>
								<TableCell className="font-medium w-40">
									Action
								</TableCell>
								<TableCell>
									<Badge variant="outline" className="font-mono text-xs">
										{log.action}
									</Badge>
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Entity Type</TableCell>
								<TableCell>{log.entityType}</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Entity ID</TableCell>
								<TableCell>
									<span className="font-mono text-xs text-muted-foreground">
										{log.entityId}
									</span>
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Actor</TableCell>
								<TableCell>
									{log.actorEmail ? (
										<span>{log.actorEmail}</span>
									) : log.actorUserId ? (
										<span className="font-mono text-xs text-muted-foreground">
											{log.actorUserId}
										</span>
									) : (
										<span className="text-muted-foreground italic">
											System
										</span>
									)}
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Timestamp</TableCell>
								<TableCell>
									<time dateTime={new Date(log.createdAt).toISOString()}>
										{formatDate(log.createdAt)}
									</time>
								</TableCell>
							</TableRow>
							{log.requestId && (
								<TableRow>
									<TableCell className="font-medium">
										Request ID
									</TableCell>
									<TableCell>
										<span className="font-mono text-xs text-muted-foreground">
											{log.requestId}
										</span>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Snapshots */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Before snapshot */}
				<div className="rounded-lg border bg-card">
					<div className="p-6">
						<h2 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
							<Icon
								name="clock"
								className="h-4 w-4 text-muted-foreground"
								aria-hidden="true"
							/>
							Before
						</h2>
						{renderJsonValue(log.before)}
					</div>
				</div>

				{/* After snapshot */}
				<div className="rounded-lg border bg-card">
					<div className="p-6">
						<h2 className="text-base font-medium text-foreground mb-4 flex items-center gap-2">
							<Icon
								name="check"
								className="h-4 w-4 text-green-600"
								aria-hidden="true"
							/>
							After
						</h2>
						{renderJsonValue(log.after)}
					</div>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon
							name="magnifying-glass"
							className="h-12 w-12 text-muted-foreground"
						/>
						<h2 className="text-xl font-semibold">
							Audit Log Entry Not Found
						</h2>
						<p className="text-muted-foreground text-center">
							The audit log entry you're looking for doesn't exist or has
							been removed.
						</p>
						<Button asChild>
							<Link to="/admin/audit-log">
								Back to Audit Log
							</Link>
						</Button>
					</div>
				),
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
