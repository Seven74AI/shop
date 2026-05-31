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
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
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

export async function loader({ request }: Route.LoaderArgs) {
	const loginUserId = await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const rawParams = Object.fromEntries(url.searchParams)
	const parsed = AuditSearchSchema.safeParse(rawParams)

	const params = parsed.success
		? parsed.data
		: { page: 1, perPage: 30 }

	const { page, perPage, action, entityType, userId, q, from, to } = params

	const where: Record<string, unknown> = {}

	if (action) where.action = action
	if (entityType) where.entityType = entityType
	if (userId) where.userId = userId

	// Text search across entityId and entityType
	if (q) {
		where.OR = [
			{ entityType: { contains: q } },
			{ entityId: { contains: q } },
		]
	}

	// Date range filter
	if (from || to) {
		where.createdAt = {}
		if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
		if (to) {
			const toDate = new Date(to)
			toDate.setHours(23, 59, 59, 999)
			;(where.createdAt as Record<string, unknown>).lte = toDate
		}
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

	// Get unique entity types for filter dropdown
	const entityTypes = await prisma.auditLog.findMany({
		select: { entityType: true },
		distinct: ['entityType'],
		orderBy: { entityType: 'asc' },
		take: 50,
	})

	const uniqueEntityTypes = entityTypes.map((e) => e.entityType)

	return {
		auditLogs,
		page,
		perPage,
		total,
		totalPages,
		currentUserId: loginUserId,
		entityTypes: uniqueEntityTypes,
		filters: { action, entityType, userId, q, from, to },
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Audit Log | Admin | Epic Shop' },
	{
		name: 'description',
		content: 'View and filter audit log entries for all data mutations',
	},
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
