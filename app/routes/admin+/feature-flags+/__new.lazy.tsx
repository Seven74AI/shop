export default function NewFeatureFlag({ actionData }: Route.ComponentProps) {
	const { t } = useTranslation()
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					{t('admin.flags.new.title')}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{t('admin.flags.new.description')}
				</p>
			</div>

			<FlagForm actionData={actionData} t={t} />
		</div>
	)
}
