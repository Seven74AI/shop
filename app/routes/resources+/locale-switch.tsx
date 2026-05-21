import { useForm, getFormProps } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { redirect, useFetcher } from 'react-router'
import { ServerOnly } from 'remix-utils/server-only'
import { z } from 'zod'
import { setLocaleCookie } from '#app/utils/i18n.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { useRequestInfo } from '#app/utils/request-info.ts'
import { type Route } from './+types/locale-switch.ts'

const LocaleFormSchema = z.object({
	locale: z.enum(['en', 'fr']),
	redirectTo: z.string().optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: LocaleFormSchema,
	})

	invariantResponse(submission.status === 'success', 'Invalid locale received')

	const { locale, redirectTo } = submission.value

	const responseInit = {
		headers: { 'set-cookie': setLocaleCookie(locale) },
	}
	// Always redirect — either to the specified page, or to the referer / home
	return redirect(redirectTo || '/', responseInit)
}

export function LocaleSwitch() {
	const fetcher = useFetcher<typeof action>()
	const requestInfo = useRequestInfo()
	const { locale: currentLocale, t } = useTranslation()

	const [form] = useForm({
		id: 'locale-switch',
	})

	const activeClass = 'text-sm font-bold underline underline-offset-2'
	const inactiveClass = 'text-sm font-medium underline-offset-2 hover:underline'

	return (
		<fetcher.Form
			method="POST"
			{...getFormProps(form)}
			action="/resources/locale-switch"
		>
			<ServerOnly>
				{() => (
					<input type="hidden" name="redirectTo" value={requestInfo.path} />
				)}
			</ServerOnly>
			<div className="flex gap-2" role="group" aria-label={t('footer.locale.label')}>
				<button
					type="submit"
					name="locale"
					value="en"
					className={currentLocale === 'en' ? activeClass : inactiveClass}
					aria-label={t('footer.locale.en')}
					aria-current={currentLocale === 'en' ? 'true' : undefined}
				>
					EN
				</button>
				<button
					type="submit"
					name="locale"
					value="fr"
					className={currentLocale === 'fr' ? activeClass : inactiveClass}
					aria-label={t('footer.locale.fr')}
					aria-current={currentLocale === 'fr' ? 'true' : undefined}
				>
					FR
				</button>
			</div>
		</fetcher.Form>
	)
}
