import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, useFetcher } from 'react-router'
import { z } from 'zod'
import { createConsentState, setConsent } from '#app/utils/consent.server.ts'
import { CONSENT_CATEGORIES, type ConsentCategory } from '#app/utils/consent.ts'
import { type Route } from './+types/consent.ts'

const ConsentFormSchema = z.object({
	/** Comma-separated list of consented categories, empty string = refuse all */
	granted: z.string().optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ConsentFormSchema,
	})

	invariantResponse(
		submission.status === 'success',
		'Invalid consent submission',
	)

	const raw = submission.value.granted ?? ''
	const granted: ConsentCategory[] = raw
		? raw
				.split(',')
				.filter((c): c is ConsentCategory =>
					CONSENT_CATEGORIES.includes(c as ConsentCategory),
				)
		: []

	const consentState = createConsentState(granted)

	return data(
		{ result: submission.reply(), consent: consentState },
		{ headers: { 'set-cookie': setConsent(consentState) } },
	)
}

/**
 * Client-side hook to grant consent via a fetcher.
 * Usage: const { grant, refuse, acceptAll } = useConsentFetcher()
 */
export function useConsentFetcher() {
	const fetcher = useFetcher<typeof action>()

	function grant(categories: ConsentCategory[]) {
		void fetcher.submit(
			{ granted: categories.join(',') },
			{ method: 'POST', action: '/resources/consent' },
		)
	}

	function acceptAll() {
		grant([...CONSENT_CATEGORIES])
	}

	function refuseAll() {
		grant([])
	}

	return { fetcher, grant, acceptAll, refuseAll }
}
