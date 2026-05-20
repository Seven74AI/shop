import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
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

// Helper to format basis points as percentage
function formatRate(basisPoints: number): string {
	const pct = basisPoints / 100
	return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`
}

// Helper to get badge variant for TaxKind
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

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const taxRates = await prisma.taxRate.findMany({
		orderBy: [
			{ country: 'asc' },
			{ kind: 'asc' },
			{ effectiveFrom: 'desc' },
		],
	})

	return { taxRates }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Tax Rates | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage tax rates for different countries' },
]

function DeleteButton({ taxRate }: { taxRate: Route.ComponentProps['loaderData']['taxRates'][number] }) {
	const fetcher = useFetcher()

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive hover:text-destructive transition-colors duration-200"
					aria-label={`Delete ${taxRate.country} ${taxRate.kind} tax rate`}
				>
					<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Tax Rate</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete the {taxRate.kind} tax rate for {taxRate.country} ({formatRate(taxRate.rate)})? This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<fetcher.Form
						method="POST"
						action={`/admin/tax-rates/${taxRate.id}/delete`}
					>
						<input type="hidden" name="rateId" value={taxRate.id} />
						<AlertDialogAction
							type="submit"
							disabled={fetcher.state !== 'idle'}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							{fetcher.state === 'idle' ? 'Delete Tax Rate' : 'Deleting...'}
						</AlertDialogAction>
					</fetcher.Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function TaxRateRow({ taxRate }: { taxRate: Route.ComponentProps['loaderData']['taxRates'][number] }) {
	const isExpired = taxRate.effectiveTo && new Date(taxRate.effectiveTo) < new Date()

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center gap-2">
					<span className="font-medium">{taxRate.country}</span>
				</div>
			</TableCell>
			<TableCell>
				<Badge variant={getTaxKindBadge(taxRate.kind)} className="text-xs">
					{taxRate.kind}
				</Badge>
			</TableCell>
			<TableCell className="font-mono tabular-nums">
				{formatRate(taxRate.rate)}
			</TableCell>
			<TableCell className="hidden md:table-cell text-sm text-muted-foreground">
				{new Date(taxRate.effectiveFrom).toLocaleDateString()}
			</TableCell>
			<TableCell className="hidden md:table-cell text-sm text-muted-foreground">
				{taxRate.effectiveTo
					? new Date(taxRate.effectiveTo).toLocaleDateString()
					: <span className="text-muted-foreground/50">No end date</span>}
			</TableCell>
			<TableCell className="hidden lg:table-cell">
				{taxRate.isActive ? (
					<Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
						Active
					</Badge>
				) : isExpired ? (
					<Badge variant="outline" className="text-xs text-muted-foreground">
						Expired
					</Badge>
				) : (
					<Badge variant="secondary" className="text-xs">
						Inactive
					</Badge>
				)}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-1">
					<Button variant="ghost" size="sm" asChild>
						<Link to={`/admin/tax-rates/${taxRate.id}`} aria-label={`View ${taxRate.country} ${taxRate.kind}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button variant="ghost" size="sm" asChild>
						<Link to={`/admin/tax-rates/${taxRate.id}/edit`} aria-label={`Edit ${taxRate.country} ${taxRate.kind}`}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<DeleteButton taxRate={taxRate} />
				</div>
			</TableCell>
		</TableRow>
	)
}

export default function TaxRatesList({ loaderData }: Route.ComponentProps) {
	const { taxRates } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterKind, setFilterKind] = useState('all')
	const [filterStatus, setFilterStatus] = useState('all')

	type TaxRate = Route.ComponentProps['loaderData']['taxRates'][number]

	const filteredRates = useMemo(() => {
		let filtered = taxRates

		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter((rate: TaxRate) =>
				rate.country.toLowerCase().includes(search) ||
				rate.kind.toLowerCase().includes(search)
			)
		}

		if (filterKind !== 'all') {
			filtered = filtered.filter((rate: TaxRate) => rate.kind === filterKind)
		}

		if (filterStatus === 'active') {
			filtered = filtered.filter((rate: TaxRate) => rate.isActive)
		} else if (filterStatus === 'inactive') {
			filtered = filtered.filter((rate: TaxRate) => !rate.isActive)
		}

		return filtered
	}, [taxRates, searchTerm, filterKind, filterStatus])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Tax Rates</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage VAT/tax rates for different countries ({taxRates.length} rates)
						{searchTerm.trim() || filterKind !== 'all' || filterStatus !== 'all' ? ` • ${filteredRates.length} shown` : ''}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/tax-rates/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						Add Tax Rate
					</Link>
				</Button>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon name="magnifying-glass" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search by country code or tax kind..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-40">
					<Select value={filterKind} onValueChange={setFilterKind}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Filter by kind">
							<SelectValue placeholder="All kinds" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Kinds</SelectItem>
							<SelectItem value="STANDARD">Standard</SelectItem>
							<SelectItem value="REDUCED">Reduced</SelectItem>
							<SelectItem value="SUPER_REDUCED">Super Reduced</SelectItem>
							<SelectItem value="ZERO">Zero</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="sm:w-40">
					<Select value={filterStatus} onValueChange={setFilterStatus}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Filter by status">
							<SelectValue placeholder="All statuses" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Statuses</SelectItem>
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="inactive">Inactive</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Tax Rates Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">Country</TableHead>
							<TableHead className="font-semibold">Kind</TableHead>
							<TableHead className="font-semibold">Rate</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">Effective From</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">Effective To</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Status</TableHead>
							<TableHead className="text-right font-semibold">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredRates.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="text-center py-16">
									{searchTerm.trim() || filterKind !== 'all' || filterStatus !== 'all' ? (
										<div className="text-muted-foreground">
											<Icon name="magnifying-glass" className="h-12 w-12 mx-auto mb-4 opacity-50" />
											<h2 className="text-xl font-semibold mb-2">No tax rates found</h2>
											<p className="max-w-md mx-auto">
												{searchTerm ? (
													<>No tax rates match your search for "<strong>{searchTerm}</strong>".</>
												) : (
													<>No tax rates match the selected filters.</>
												)}
											</p>
											<div className="flex gap-3 justify-center mt-4">
												<Button
													variant="outline"
													onClick={() => {
														setSearchTerm('')
														setFilterKind('all')
														setFilterStatus('all')
													}}
													className="h-9 rounded-lg font-medium"
												>
													Clear filters
												</Button>
											</div>
										</div>
									) : (
										<div className="text-muted-foreground">
											<Icon name="layers" className="h-12 w-12 mx-auto mb-4 opacity-50" />
											<h2 className="text-xl font-semibold mb-2">No tax rates yet</h2>
											<p className="max-w-md mx-auto">
												Get started by creating your first tax rate for VAT calculations.
											</p>
											<Button asChild className="h-9 rounded-lg font-medium mt-4">
												<Link to="/admin/tax-rates/new">
													<Icon name="plus" className="mr-2 h-4 w-4" />
													Add Tax Rate
												</Link>
											</Button>
										</div>
									)}
								</TableCell>
							</TableRow>
						) : (
							filteredRates.map((rate: TaxRate) => (
								<TaxRateRow key={rate.id} taxRate={rate} />
							))
						)}
					</TableBody>
				</Table>
			</Card>
		</div>
	)
}
