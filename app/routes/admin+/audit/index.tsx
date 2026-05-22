import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

const AuditSearchSchema = z.object({
	q: z.string().optional(),
	action: z.string().optional(),
	entityType: z.string().optional(),
	entityId: z.string().optional(),
	userId: z.string().optional(),
	page: z.coerce.number().int().positive().default(1),
	perPage: z.coerce.number().int().positive().max(100).default(50),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const rawParams = Object.fromEntries(url.searchParams)
	const parsed = AuditSearchSchema.safeParse(rawParams)

	const { page, perPage, action, entityType, userId: filterUserId, from, to } =
		parsed.success ? parsed.data : { page: 1, perPage: 50, action: undefined, entityType: undefined, userId: undefined, from: undefined, to: undefined }

	const where: Record<string, unknown> = {}

	if (action) where.action = action
	if (entityType) where.entityType = entityType
	if (filterUserId) where.userId = filterUserId
	if (from || to) {
		where.createdAt = {}
		if (from) (where.createdAt as Record<string, unknown>).gte = from
		if (to) (where.createdAt as Record<string, unknown>).lte = to
	}

	const [auditLogs, total] = await Promise.all([
		prisma.auditLog.findMany({
			where,
			include: {
				user: {
					select: { id: true, email: true, username: true, name: true },
				},
			},
			orderBy: { createdAt: 'desc' },
			skip: (page - 1) * perPage,
			take: perPage,
		}),
		prisma.auditLog.count({ where }),
	])

	const totalPages = Math.ceil(total / perPage)

	return {
		auditLogs,
		page,
		perPage,
		total,
		totalPages,
		currentUserId: userId,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Audit Log | Admin | Epic Shop' },
	{
		name: 'description',
		content: 'View audit log entries for all data mutations',
	},
]

export default function AuditIndex({ loaderData }: Route.ComponentProps) {
	const { auditLogs, page, totalPages, total } = loaderData

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Audit Log
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{total} audit {total === 1 ? 'entry' : 'entries'}
					</p>
				</div>
			</div>

			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-sm">
					<thead className="bg-muted/50 border-b">
						<tr>
							<th className="px-4 py-3 text-left font-medium">Date</th>
							<th className="px-4 py-3 text-left font-medium">User</th>
							<th className="px-4 py-3 text-left font-medium">Action</th>
							<th className="px-4 py-3 text-left font-medium">Entity</th>
							<th className="px-4 py-3 text-left font-medium">Entity ID</th>
							<th className="px-4 py-3 text-left font-medium">IP</th>
						</tr>
					</thead>
					<tbody>
						{auditLogs.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="px-4 py-8 text-center text-muted-foreground"
								>
									No audit entries found.
								</td>
							</tr>
						) : (
							auditLogs.map((entry) => (
								<tr key={entry.id} className="border-t hover:bg-muted/30">
									<td className="px-4 py-2 text-xs whitespace-nowrap">
										{new Date(entry.createdAt).toLocaleString()}
									</td>
									<td className="px-4 py-2">
										{entry.user ? (
											<span className="text-xs">
												{entry.user.name || entry.user.username || entry.user.email}
											</span>
										) : (
											<span className="text-xs text-muted-foreground italic">
												System
											</span>
										)}
									</td>
									<td className="px-4 py-2">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
												entry.action === 'DELETE'
													? 'bg-red-100 text-red-700'
													: entry.action === 'CREATE'
														? 'bg-green-100 text-green-700'
														: entry.action === 'UPDATE'
															? 'bg-blue-100 text-blue-700'
															: 'bg-gray-100 text-gray-700'
											}`}
										>
											{entry.action}
										</span>
									</td>
									<td className="px-4 py-2 text-xs">{entry.entityType}</td>
									<td className="px-4 py-2 text-xs font-mono max-w-32 truncate">
										{entry.entityId}
									</td>
									<td className="px-4 py-2 text-xs text-muted-foreground font-mono">
										{entry.ipAddress || '—'}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Page {page} of {totalPages}
					</div>
					<div className="flex items-center gap-2">
						{page > 1 && (
							<a
								href={`?page=${page - 1}`}
								className="px-3 py-1 text-sm border rounded hover:bg-muted"
							>
								Previous
							</a>
						)}
						{page < totalPages && (
							<a
								href={`?page=${page + 1}`}
								className="px-3 py-1 text-sm border rounded hover:bg-muted"
							>
								Next
							</a>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
