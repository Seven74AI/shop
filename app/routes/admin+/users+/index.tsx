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
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all users with related data
	const users = await prisma.user.findMany({
		include: {
			image: {
				select: {
					objectKey: true,
					altText: true,
				},
			},
			roles: {
				select: {
					id: true,
					name: true,
				},
			},
			_count: {
				select: {
					orders: true,
					sessions: true,
				},
			},
		},
		orderBy: { createdAt: 'desc' },
	})

	// Get all roles for filter
	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return {
		users,
		roles,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Users | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage all users' },
]

const ITEMS_PER_PAGE = 25

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
