export default function FeatureFlagsList({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const { flags } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled'>('all')

	const filteredFlags = useMemo(() => {
		let filtered = flags

		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(flag) =>
					flag.key.toLowerCase().includes(search) ||
					(flag.description && flag.description.toLowerCase().includes(search)),
			)
		}

		if (filterStatus === 'enabled') {
			filtered = filtered.filter((flag) => flag.enabled)
		} else if (filterStatus === 'disabled') {
			filtered = filtered.filter((flag) => !flag.enabled)
		}

		return filtered
	}, [flags, searchTerm, filterStatus])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						{t('admin.flags.title')}
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{t('admin.flags.manageDescription', { count: flags.length, plural: flags.length === 1 ? '' : 's' })}
						{searchTerm || filterStatus !== 'all' ? (
							<span className="ml-2">• {t('admin.flags.shown', { count: filteredFlags.length })}</span>
						) : null}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/feature-flags/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						{t('admin.flags.addFlag')}
					</Link>
				</Button>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder={t('admin.flags.searchPlaceholder')}
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as typeof filterStatus)}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder={t('admin.flags.filter.all')} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">{t('admin.flags.filter.all')}</SelectItem>
							<SelectItem value="enabled">{t('admin.flags.filter.enabled')}</SelectItem>
							<SelectItem value="disabled">{t('admin.flags.filter.disabled')}</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Flags Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">{t('admin.flags.table.flag')}</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">{t('admin.flags.table.targeting')}</TableHead>
							<TableHead className="text-right font-semibold">{t('admin.flags.table.actions')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredFlags.map((flag) => (
							<FlagRow key={flag.key} flag={flag} t={t} />
						))}
					</TableBody>
				</Table>
			</Card>

			{flags.length === 0 && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="settings" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">{t('admin.flags.empty.title')}</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{t('admin.flags.empty.description')}
					</p>
					<Button asChild size="lg" className="h-9 rounded-lg font-medium">
						<Link to="/admin/feature-flags/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Flag
						</Link>
					</Button>
				</div>
			)}

			{/* No search results */}
			{flags.length > 0 && filteredFlags.length === 0 && (searchTerm || filterStatus !== 'all') && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">{t('admin.flags.noResults.title')}</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{searchTerm ? (
							<>
								{t('admin.flags.noResults.searchMatch', { search: searchTerm })}
							</>
						) : (
							<>{t('admin.flags.noResults.filterMatch')}</>
						)}
					</p>
					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Button
							variant="outline"
							onClick={() => {
								setSearchTerm('')
								setFilterStatus('all')
							}}
							className="h-9 rounded-lg font-medium"
						>
							{t('admin.flags.clearFilters')}
						</Button>
						<Button asChild className="h-9 rounded-lg font-medium">
							<Link to="/admin/feature-flags/new">
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Flag
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
