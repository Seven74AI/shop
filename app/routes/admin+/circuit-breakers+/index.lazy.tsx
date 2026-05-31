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
import { getCircuitBreakerHealthSummary } from '#app/utils/circuit-breaker-registry.server.ts'
import type { CircuitBreakerEvent } from '#app/utils/circuit-breaker.server.ts'
import { type Route } from './+types/index.ts'



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

export default function CircuitBreakersDashboard({
	loaderData,
}: Route.ComponentProps) {
	const { summary } = loaderData

	// Build a combined event log: merge all breakers' events, sort by timestamp desc, top 50
	const combinedEvents = useMemo(() => {
		const allEvents: (CircuitBreakerEvent & { breakerName: string })[] = []
		for (const breaker of summary.breakers) {
			for (const event of breaker.lastEvents) {
				allEvents.push({
					...event,
					breakerName: breaker.name,
				})
			}
		}
		allEvents.sort((a, b) => b.timestamp - a.timestamp)
		return allEvents.slice(0, 50)
	}, [summary.breakers])

	// Compute last reset time per breaker from RESET events
	const lastResetTimes = useMemo(() => {
		const map = new Map<string, number>()
		for (const breaker of summary.breakers) {
			const resetEvent = breaker.lastEvents.find((e) => e.type === 'RESET')
			if (resetEvent) {
				map.set(breaker.name, resetEvent.timestamp)
			}
		}
		return map
	}, [summary.breakers])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					Circuit Breakers
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Monitor external service health and manage circuit breaker states
				</p>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Total</div>
					<div className="text-2xl font-semibold">{summary.total}</div>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Closed</div>
					<div className="text-2xl font-semibold text-green-600">
						{summary.closed}
					</div>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Open</div>
					<div className="text-2xl font-semibold text-red-600">
						{summary.open}
					</div>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Half-Open</div>
					<div className="text-2xl font-semibold text-yellow-600">
						{summary.halfOpen}
					</div>
				</div>
			</div>

			{/* Breakers Table */}
			{summary.breakers.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<Icon
						name="shield"
						className="h-12 w-12 text-muted-foreground mb-4"
					/>
					<h2 className="text-lg font-medium text-foreground">
						No Circuit Breakers Registered
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Circuit breakers are automatically registered when services
						initialize. No services have registered yet.
					</p>
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>State</TableHead>
							<TableHead className="hidden md:table-cell">
								Failure Count
							</TableHead>
							<TableHead className="hidden lg:table-cell">
								Total Failures
							</TableHead>
							<TableHead className="hidden lg:table-cell">
								Total Successes
							</TableHead>
							<TableHead className="hidden lg:table-cell">
								Total Rejections
							</TableHead>
							<TableHead className="hidden md:table-cell">
								Last Failure
							</TableHead>
							<TableHead className="hidden lg:table-cell">
								Last Reset
							</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{summary.breakers.map((breaker) => (
							<TableRow
								key={breaker.name}
								className="transition-colors duration-150 hover:bg-muted/50"
							>
								<TableCell className="font-mono text-sm">
									{breaker.name}
								</TableCell>
								<TableCell>
									<StateBadge state={breaker.state} />
								</TableCell>
								<TableCell className="hidden md:table-cell">
									{breaker.failureCount}
								</TableCell>
								<TableCell className="hidden lg:table-cell">
									{breaker.totalFailures}
								</TableCell>
								<TableCell className="hidden lg:table-cell">
									{breaker.totalSuccesses}
								</TableCell>
								<TableCell className="hidden lg:table-cell">
									{breaker.totalRejections}
								</TableCell>
								<TableCell className="hidden md:table-cell text-sm text-muted-foreground">
									{breaker.state === 'OPEN' &&
									breaker.openedAt ? (
										<div>
											<div className="text-destructive font-medium">
												Opened{' '}
												{formatDuration(breaker.openedAt)}
											</div>
											<div className="text-xs">
												{formatTime(breaker.openedAt)}
											</div>
										</div>
									) : breaker.lastFailureTime ? (
										formatDuration(breaker.lastFailureTime)
									) : (
										<span className="text-muted-foreground/50">
											None
										</span>
									)}
								</TableCell>
								<TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
									{lastResetTimes.has(breaker.name)
										? formatDuration(lastResetTimes.get(breaker.name)!)
										: '—'}
								</TableCell>
								<TableCell>
									<ResetButton
										name={breaker.name}
										state={breaker.state}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			{/* Events Log Section */}
			{combinedEvents.length > 0 && (
				<div>
					<h2 className="text-lg font-normal text-foreground mb-4">
						Event Log
					</h2>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-40">Time</TableHead>
									<TableHead className="w-32">Breaker</TableHead>
									<TableHead className="w-24">Event</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{combinedEvents.map((event, i) => (
									<TableRow
										key={`${event.breakerName}-${event.timestamp}-${i}`}
										className="text-sm"
									>
										<TableCell className="text-muted-foreground font-mono text-xs">
											{formatTime(event.timestamp)}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{event.breakerName}
										</TableCell>
										<TableCell>
											<EventTypeBadge type={event.type} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<p className="text-xs text-muted-foreground mt-2">
						Showing the most recent {combinedEvents.length} events across
						all circuit breakers.
					</p>
				</div>
			)}

			{/* Empty events fallback */}
			{summary.breakers.length > 0 && combinedEvents.length === 0 && (
				<div>
					<h2 className="text-lg font-normal text-foreground mb-4">
						Event Log
					</h2>
					<p className="text-sm text-muted-foreground">
						No events recorded yet. Events are logged when circuit breakers
						transition between states or are manually reset.
					</p>
				</div>
			)}
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon
							name="lock-closed"
							className="h-12 w-12 text-muted-foreground"
						/>
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							You do not have permission to access this page.
						</p>
					</div>
				),
			}}
		/>
	)
}
