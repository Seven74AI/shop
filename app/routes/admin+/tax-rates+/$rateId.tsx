import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$rateId.ts'

// Helper to format basis points as percentage
function formatRate(basisPoints: number): string {
	const pct = basisPoints / 100
	return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`
}

function getTaxKindBadge(kind: string): 'default' | 'secondary' | 'outline' | 'warning' {
	switch (kind) {
		case 'STANDARD':
			return 'default'
		case 'REDUCED':
			return 'secondary'
		case 'SUPER_REDUCED':
			return 'warning'
		case 'ZERO':
			return 'outline'
		default:
			return 'default'
	}
}

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const taxRate = await prisma.taxRate.findUnique({
		where: { id: params.rateId },
	})

	invariantResponse(taxRate, 'Tax rate not found', { status: 404 })

	return { taxRate }
}

export const meta: Route.MetaFunction = ({ loaderData }: { loaderData: Route.ComponentProps['loaderData'] | undefined }) => [
	{ title: `${loaderData?.taxRate.kind} ${loaderData?.taxRate.country} | Tax Rates | Admin | Epic Shop` },
	{ name: 'description', content: `Tax rate details: ${loaderData?.taxRate.kind} for ${loaderData?.taxRate.country}` },
]

export default function TaxRateDetail({ loaderData }: Route.ComponentProps) {
	const { taxRate } = loaderData
	const isExpired = taxRate.effectiveTo && new Date(taxRate.effectiveTo) < new Date()

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Tax Rate: {taxRate.country} - {taxRate.kind}
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Tax rate details and information
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" asChild className="h-9 rounded-lg font-medium">
						<Link to="/admin/tax-rates">
							<Icon name="arrow-left" className="h-4 w-4 mr-2" />
							Back to Tax Rates
						</Link>
					</Button>
					<Button asChild className="h-9 rounded-lg font-medium">
						<Link to={`/admin/tax-rates/${taxRate.id}/edit`}>
							<Icon name="pencil-1" className="h-4 w-4 mr-2" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			<Card className="rounded-[14px]">
				<CardHeader>
					<div className="flex items-center justify-between">
						<h2 className="text-base font-normal text-foreground">Tax Rate Details</h2>
						<div className="flex items-center gap-2">
							{taxRate.isActive ? (
								<Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
									Active
								</Badge>
							) : (
								<Badge variant="secondary" className="text-xs">
									Inactive
								</Badge>
							)}
							<Badge variant={getTaxKindBadge(taxRate.kind)} className="text-xs">
								{taxRate.kind}
							</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<dl className="grid gap-6 sm:grid-cols-2">
						<div>
							<dt className="text-sm font-medium text-muted-foreground">Country</dt>
							<dd className="mt-1 text-lg font-mono">{taxRate.country}</dd>
						</div>

						<div>
							<dt className="text-sm font-medium text-muted-foreground">Tax Kind</dt>
							<dd className="mt-1 text-lg">{taxRate.kind}</dd>
						</div>

						<div>
							<dt className="text-sm font-medium text-muted-foreground">Rate</dt>
							<dd className="mt-1 text-lg font-mono tabular-nums">{formatRate(taxRate.rate)}</dd>
							<dd className="text-xs text-muted-foreground">{taxRate.rate} basis points</dd>
						</div>

						<div>
							<dt className="text-sm font-medium text-muted-foreground">Status</dt>
							<dd className="mt-1">
								{taxRate.isActive ? (
									isExpired ? (
										<span className="text-muted-foreground">Active (past end date)</span>
									) : (
										<span className="text-green-600 dark:text-green-400">Active</span>
									)
								) : (
									<span className="text-muted-foreground">Inactive</span>
								)}
							</dd>
						</div>

						<div>
							<dt className="text-sm font-medium text-muted-foreground">Effective From</dt>
							<dd className="mt-1 text-lg">
								{new Date(taxRate.effectiveFrom).toLocaleDateString('en-GB', {
									day: 'numeric',
									month: 'long',
									year: 'numeric',
								})}
							</dd>
						</div>

						<div>
							<dt className="text-sm font-medium text-muted-foreground">Effective To</dt>
							<dd className="mt-1 text-lg">
								{taxRate.effectiveTo
									? new Date(taxRate.effectiveTo).toLocaleDateString('en-GB', {
											day: 'numeric',
											month: 'long',
											year: 'numeric',
										})
									: <span className="text-muted-foreground">Open-ended</span>}
							</dd>
						</div>

						<div>
							<dt className="text-sm font-medium text-muted-foreground">Created</dt>
							<dd className="mt-1 text-sm text-muted-foreground">
								{new Date(taxRate.createdAt).toLocaleDateString('en-GB', {
									day: 'numeric',
									month: 'long',
									year: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
								})}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>
		</div>
	)
}
