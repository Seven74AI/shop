import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, redirect } from 'react-router'
import { z } from 'zod'
import { type Locale, setLocaleCookie } from '#app/utils/i18n.server.ts'
import { type Route } from './+types/set-locale.ts'

const LocaleFormSchema = z.object({
	locale: z.enum(['fr', 'en']),
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
		headers: { 'set-cookie': setLocaleCookie(locale as Locale) },
	}

	if (redirectTo) {
		return redirect(redirectTo, responseInit)
	}

	return data({ result: submission.reply() }, responseInit)
}
