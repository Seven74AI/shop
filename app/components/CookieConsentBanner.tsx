import { getFormProps, useForm } from '@conform-to/react'
import { useFetcher } from 'react-router'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { useTranslation } from '#app/utils/i18n.tsx'
import { COOKIE_NAME } from '#app/utils/consent-constants.ts'


interface ConsentPrefs {
	necessary: boolean
	analytics: boolean
	marketing: boolean
}

/**
 * Read the consent cookie from document.cookie.
 * Returns null if no valid consent cookie exists.
 */
function getConsentFromDocument(): ConsentPrefs | null {
	try {
		const match = document.cookie.match(
			new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`),
		)
		if (!match?.[1]) return null
		const parsed = JSON.parse(decodeURIComponent(match[1])) as Record<
			string,
			unknown
		>
		if (
			parsed &&
			typeof parsed.necessary === 'boolean' &&
			parsed.necessary === true &&
			typeof parsed.analytics === 'boolean' &&
			typeof parsed.marketing === 'boolean'
		) {
			return parsed as unknown as ConsentPrefs
		}
		return null
	} catch {
		return null
	}
}

export function CookieConsentBanner() {
	const { t } = useTranslation()
	const fetcher = useFetcher()
	const [showCustomize, setShowCustomize] = useState(false)
	const [showBanner, setShowBanner] = useState(false)
	const [hydrated, setHydrated] = useState(false)

	// On mount, check if consent already exists
	useEffect(() => {
		const existing = getConsentFromDocument()
		if (!existing) {
			setShowBanner(true)
		}
		setHydrated(true)
	}, [])

	// When the fetcher completes successfully, hide the banner
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.success) {
			setShowBanner(false)
		}
	}, [fetcher.state, fetcher.data])

	const acceptAll = useCallback(() => {
		const formData = new FormData()
		formData.set('analytics', 'true')
		formData.set('marketing', 'true')
		void fetcher.submit(formData, {
			method: 'POST',
			action: '/resources/cookie-consent',
		})
	}, [fetcher])

	const declineAll = useCallback(() => {
		const formData = new FormData()
		formData.set('analytics', 'false')
		formData.set('marketing', 'false')
		void fetcher.submit(formData, {
			method: 'POST',
			action: '/resources/cookie-consent',
		})
	}, [fetcher])

	// Don't render anything during SSR or before hydration
	if (!hydrated) return null

	if (!showBanner) return null

	return (
		<div
			role="dialog"
			aria-label={t('cookie.consent.title')}
			aria-modal="false"
			className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card p-4 shadow-lg md:p-6"
		>
			{!showCustomize ? (
				<BannerContent
					onAcceptAll={acceptAll}
					onDeclineAll={declineAll}
					onCustomize={() => setShowCustomize(true)}
					t={t}
				/>
			) : (
				<CustomizePanel
					onBack={() => setShowCustomize(false)}
					t={t}
				/>
			)}
		</div>
	)
}

function BannerContent({
	onAcceptAll,
	onDeclineAll,
	onCustomize,
	t,
}: {
	onAcceptAll: () => void
	onDeclineAll: () => void
	onCustomize: () => void
	t: (key: string, params?: Record<string, string>) => string
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex-1">
				<h2 className="text-lg font-semibold">
					{t('cookie.consent.title')}
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{t('cookie.consent.description')}
				</p>
			</div>
			<div className="flex flex-wrap gap-3">
				<Button
					variant="default"
					size="sm"
					onClick={onAcceptAll}
					disabled={false}
				>
					{t('cookie.consent.acceptAll')}
				</Button>
				<Button variant="outline" size="sm" onClick={onDeclineAll}>
					{t('cookie.consent.declineAll')}
				</Button>
				<Button variant="ghost" size="sm" onClick={onCustomize}>
					{t('cookie.consent.customize')}
				</Button>
			</div>
		</div>
	)
}

function CustomizePanel({
	onBack,
	t,
}: {
	onBack: () => void
	t: (key: string, params?: Record<string, string>) => string
}) {
	const fetcher = useFetcher()
	const [form] = useForm({ id: 'cookie-consent-customize' })

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="text-lg font-semibold">
					{t('cookie.consent.customizeTitle')}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t('cookie.consent.customizeDescription')}
				</p>
			</div>

			<fetcher.Form
				method="POST"
				action="/resources/cookie-consent"
				{...getFormProps(form)}
				className="flex flex-col gap-3"
			>
				<div className="flex items-center gap-3 rounded-md border p-3">
					<Checkbox
						id="consent-necessary"
						checked={true}
						disabled={true}
						aria-readonly="true"
					/>
					<div>
						<label htmlFor="consent-necessary" className="text-sm font-medium">
							{t('cookie.consent.necessary')}
						</label>
						<p className="text-xs text-muted-foreground">
							{t('cookie.consent.necessaryDesc')}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3 rounded-md border p-3">
					<Checkbox
						id="consent-analytics"
						name="analytics"
						defaultChecked={false}
					/>
					<div>
						<label htmlFor="consent-analytics" className="text-sm font-medium">
							{t('cookie.consent.analytics')}
						</label>
						<p className="text-xs text-muted-foreground">
							{t('cookie.consent.analyticsDesc')}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3 rounded-md border p-3">
					<Checkbox
						id="consent-marketing"
						name="marketing"
						defaultChecked={false}
					/>
					<div>
						<label htmlFor="consent-marketing" className="text-sm font-medium">
							{t('cookie.consent.marketing')}
						</label>
						<p className="text-xs text-muted-foreground">
							{t('cookie.consent.marketingDesc')}
						</p>
					</div>
				</div>

				<div className="flex gap-3">
					<Button type="submit" variant="default" size="sm">
						{t('cookie.consent.save')}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onBack}
					>
						{t('cookie.consent.back')}
					</Button>
				</div>
			</fetcher.Form>
		</div>
	)
}
