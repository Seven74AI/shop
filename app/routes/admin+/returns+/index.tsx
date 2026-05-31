import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ReturnStatusBadge } from '#app/components/return-status-badge.tsx'
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
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { getAllReturnRequests } from '#app/utils/return-queries.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const returns = await getAllReturnRequests()

	return { returns }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Returns | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage return requests' },
]

const ITEMS_PER_PAGE = 25

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
