import { useForm, getFormProps } from '@conform-to/react'
import { useFetcher } from 'react-router'
import { ServerOnly } from 'remix-utils/server-only'
import { useRequestInfo } from '#app/utils/request-info.ts'
import { type action } from '#app/routes/resources+/set-locale.tsx'
import { useOptionalTranslation } from '#app/utils/i18n.tsx'

export function LocaleSwitcher() {
	const fetcher = useFetcher<typeof action>()
	const requestInfo = useRequestInfo()
	const { t, locale } = useOptionalTranslation() ?? { t: (k: string) => k, locale: 'en' as const }

	const [form] = useForm({
		id: 'locale-switch',
		lastResult: fetcher.data?.result,
	})

	const nextLocale = locale === 'fr' ? 'en' : 'fr'
	const label = locale === 'fr' ? 'EN' : 'FR'

	return (
		<fetcher.Form
			method="POST"
			{...getFormProps(form)}
			action="/resources/set-locale"
			className="inline-flex"
		>
			<ServerOnly>
				{() => (
					<input type="hidden" name="redirectTo" value={requestInfo.path} />
				)}
			</ServerOnly>
			<input type="hidden" name="locale" value={nextLocale} />
			<button
				type="submit"
				className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
				title={t('footer.locale.label')}
			>
				{label}
			</button>
		</fetcher.Form>
	)
}
