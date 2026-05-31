/**
 * Circuit Breaker Monitoring Dashboard
 *
 * /admin/circuit-breakers
 *
 * Displays status, failure counts, manual reset controls, and an event log
 * for all registered circuit breakers.
 */

import { useMemo } from 'react'
import { useFetcher } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { getCircuitBreakerHealthSummary } from '#app/utils/circuit-breaker-registry.server.ts'
import type { CircuitBreakerEvent } from '#app/utils/circuit-breaker.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const summary = getCircuitBreakerHealthSummary()

	return { summary }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Circuit Breakers | Admin | Epic Shop' },
	{ name: 'description', content: 'Monitor and manage circuit breakers for external services' },
]

function StateBadge({ state }: { state: string }) {
	const variant =
		state === 'CLOSED'
			? ('success' as const)
			: state === 'OPEN'
				? ('destructive' as const)
				: ('warning' as const)

	const label =
		state === 'CLOSED'
			? 'Closed'
			: state === 'OPEN'
				? 'Open'
				: 'Half-Open'

	return <Badge variant={variant}>{label}</Badge>
}

function ResetButton({ name, state }: { name: string; state: string }) {
	const fetcher = useFetcher()
	const isOpen = state === 'OPEN' || state === 'HALF_OPEN'
	const isResetting = fetcher.state !== 'idle'

	if (!isOpen) return null

	return (
		<fetcher.Form
			method="POST"
			action={`/api/admin/circuit-breakers/${encodeURIComponent(name)}/reset`}
		>
			<Button
				type="submit"
				variant="outline"
				size="sm"
				disabled={isResetting}
				className="h-8"
			>
				<Icon
					name="update"
					className={`mr-1 h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`}
					aria-hidden="true"
				/>
				{isResetting ? 'Resetting...' : 'Reset'}
			</Button>
		</fetcher.Form>
	)
}

function formatTime(ms: number | null): string {
	if (ms === null || ms === 0) return '—'
	const date = new Date(ms)
	return date.toLocaleString()
}

function formatDuration(ms: number | null): string {
	if (ms === null || ms === 0) return '—'
	const elapsed = Date.now() - ms
	if (elapsed < 1000) return 'just now'
	const seconds = Math.floor(elapsed / 1000)
	if (seconds < 60) return `${seconds}s ago`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	return `${days}d ago`
}

function EventTypeBadge({ type }: { type: CircuitBreakerEvent['type'] }) {
	const variant =
		type === 'CLOSED'
			? ('success' as const)
			: type === 'OPEN'
				? ('destructive' as const)
				: type === 'HALF_OPEN'
					? ('warning' as const)
					: ('secondary' as const)

	return (
		<Badge variant={variant} className="text-xs px-1.5 py-0">
			{type}
		</Badge>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
