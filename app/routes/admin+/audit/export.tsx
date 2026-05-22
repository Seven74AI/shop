import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/export.ts'

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'] as const

const ExportSearchSchema = z.object({
	action: z.enum(ACTIONS).optional(),
	entityType: z.string().optional(),
	userId: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const rawParams = Object.fromEntries(url.searchParams)
	const parsed = ExportSearchSchema.safeParse(rawParams)

	const { action, entityType, userId, from, to } = parsed.success
		? parsed.data
		: {}

	const where: Record<string, unknown> = {}

	if (action) where.action = action
	if (entityType) where.entityType = entityType
	if (userId) where.userId = userId
	if (from || to) {
		where.createdAt = {}
		if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
		if (to) {
			const toDate = new Date(to)
			toDate.setHours(23, 59, 59, 999)
			;(where.createdAt as Record<string, unknown>).lte = toDate
		}
	}

	const entries = await prisma.auditLog.findMany({
		where,
		include: {
			user: {
				select: { email: true, username: true, name: true },
			},
		},
		orderBy: { createdAt: 'desc' },
		take: 10000, // reasonable cap
	})

	// Build CSV
	const header = [
		'ID',
		'Timestamp',
		'User ID',
		'User Name',
		'Action',
		'Entity Type',
		'Entity ID',
		'Changes',
		'IP Address',
		'User Agent',
	].join(',')

	const escapeField = (val: string | null | undefined): string => {
		if (val == null) return ''
		// Escape quotes and wrap in quotes if contains comma, newline, or quote
		const str = String(val)
		if (str.includes(',') || str.includes('"') || str.includes('\n')) {
			return `"${str.replace(/"/g, '""')}"`
		}
		return str
	}

	const rows = entries.map((entry) =>
		[
			entry.id,
			entry.createdAt.toISOString(),
			entry.userId ?? '',
			entry.user
				? (entry.user.name || entry.user.username || entry.user.email)
				: 'System',
			entry.action,
			entry.entityType,
			entry.entityId,
			escapeField(
				entry.changes ? JSON.stringify(entry.changes) : '',
			),
			entry.ipAddress ?? '',
			escapeField(entry.userAgent ?? ''),
		].join(','),
	)

	const csv = [header, ...rows].join('\n')
	const filename = `audit-log-export-${new Date().toISOString().split('T')[0]}.csv`

	return new Response(csv, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	})
}
