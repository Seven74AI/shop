import { data, redirect, type ActionFunctionArgs } from 'react-router'
import { type ConsentPreferences, setConsentCookie } from '#app/utils/consent.server.ts'

/**
 * Parse form data into ConsentPreferences.
 * Returns null when the input is invalid or missing.
 */
function parseConsentFormData(formData: FormData): ConsentPreferences | null {
	const analytics = formData.get('analytics')
	const marketing = formData.get('marketing')

	// All consent must have necessary=true (GDPR: essential cookies are always allowed)
	const prefs: ConsentPreferences = {
		necessary: true,
		analytics: analytics === 'true' || analytics === 'on',
		marketing: marketing === 'true' || marketing === 'on',
	}

	return prefs
}

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const consent = parseConsentFormData(formData)

	if (!consent) {
		return data({ success: false, error: 'Invalid consent data' }, { status: 400 })
	}

	const cookieHeader = setConsentCookie(consent)
	const headers = new Headers({ 'Set-Cookie': cookieHeader })

	// Check for redirect after setting consent
	const redirectTo = formData.get('redirectTo')
	if (redirectTo && typeof redirectTo === 'string') {
		return redirect(redirectTo, { headers })
	}

	return data({ success: true, consent }, { headers })
}
