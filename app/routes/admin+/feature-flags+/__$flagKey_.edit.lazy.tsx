export default function EditFeatureFlag({ loaderData, actionData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const { flag } = loaderData

	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					{t('admin.flags.edit.title')}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{t('admin.flags.edit.description', { key: flag.key })}
				</p>
			</div>

			<EditFlagForm flag={flag} actionData={actionData} t={t} />
		</div>
	)
}
