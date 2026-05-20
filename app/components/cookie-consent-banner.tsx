import { useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { useConsentFetcher } from '#app/routes/resources+/consent.tsx'
import {
	CONSENT_CATEGORIES,
	type ConsentCategory,
	type ConsentState,
} from '#app/utils/consent.ts'
import { hasConsentDecision } from '#app/utils/consent.server.ts'

const CATEGORY_LABELS: Record<ConsentCategory, { label: string; description: string }> = {
	analytics: {
		label: 'Analytics & Performance',
		description:
			'Help us understand how visitors interact with the site by collecting anonymous error and performance data (Sentry).',
	},
	marketing: {
		label: 'Marketing',
		description: 'Used to deliver relevant advertisements and measure campaign effectiveness.',
	},
}

/**
 * CNIL-compliant cookie consent banner.
 * Shows at the bottom of the page until the user makes a choice.
 * Stores consent via a resource route that sets the en_consent cookie.
 */
export function CookieConsentBanner({
	consent,
}: {
	consent: ConsentState | null
}) {
	if (hasConsentDecision(consent)) return null

	const [showCustomize, setShowCustomize] = useState(false)
	const [selected, setSelected] = useState<Set<ConsentCategory>>(
		new Set(CONSENT_CATEGORIES),
	)
	const { fetcher, grant, acceptAll, refuseAll } = useConsentFetcher()

	const isSubmitting = fetcher.state !== 'idle'
	const hasSubmitted =
		fetcher.state === 'idle' && fetcher.data !== undefined

	if (hasSubmitted) return null

	function toggleCategory(cat: ConsentCategory) {
		setSelected((prev) => {
			const next = new Set(prev)
			if (next.has(cat)) {
				next.delete(cat)
			} else {
				next.add(cat)
			}
			return next
		})
	}

	function handleAcceptAll() {
		acceptAll()
	}

	function handleRefuseAll() {
		refuseAll()
	}

	function handleSavePreferences() {
		grant([...selected])
	}

	return (
		<div
			role="dialog"
			aria-label="Cookie consent"
			aria-live="polite"
			className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-lg"
		>
			<div className="container mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
				<div className="space-y-4">
					{/* Header text */}
					<div className="text-sm leading-relaxed text-foreground">
						<p>
							We use cookies to enhance your browsing experience and analyze site
							traffic. By clicking &ldquo;Accept All&rdquo;, you consent to our use of
							cookies for analytics and marketing purposes.{' '}
							<a
								href="/privacy"
								className="underline underline-offset-2 hover:text-primary"
							>
								Learn more
							</a>
						</p>
					</div>

					{/* Customize panel */}
					{showCustomize && (
						<div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
							<p className="text-sm font-medium text-foreground">
								Manage your preferences:
							</p>
							{CONSENT_CATEGORIES.map((cat) => (
								<div key={cat} className="flex items-start gap-3">
									<Checkbox
										id={`consent-${cat}`}
										checked={selected.has(cat)}
										onCheckedChange={() => toggleCategory(cat)}
										disabled={isSubmitting}
										className="mt-0.5"
									/>
									<div className="grid gap-0.5">
										<Label
											htmlFor={`consent-${cat}`}
											className="text-sm font-medium leading-none"
										>
											{CATEGORY_LABELS[cat].label}
										</Label>
										<p className="text-xs text-muted-foreground">
											{CATEGORY_LABELS[cat].description}
										</p>
									</div>
								</div>
							))}

							{/* Necessary cookies (always on, non-optional) */}
							<div className="flex items-start gap-3 opacity-60">
								<Checkbox
									id="consent-necessary"
									checked
									disabled
									className="mt-0.5"
								/>
								<div className="grid gap-0.5">
									<Label
										htmlFor="consent-necessary"
										className="text-sm font-medium leading-none"
									>
										Necessary
									</Label>
									<p className="text-xs text-muted-foreground">
										Required for the site to function properly (session,
										authentication, cart). These cannot be disabled.
									</p>
								</div>
							</div>

							<div className="pt-2">
								<Button
									variant="default"
									size="sm"
									onClick={handleSavePreferences}
									disabled={isSubmitting}
								>
									{isSubmitting ? 'Saving...' : 'Save preferences'}
								</Button>
							</div>
						</div>
					)}

					{/* Action buttons */}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="default"
							size="sm"
							onClick={handleAcceptAll}
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Saving...' : 'Accept All'}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleRefuseAll}
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Saving...' : 'Refuse All'}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowCustomize((v) => !v)}
							disabled={isSubmitting}
						>
							{showCustomize ? 'Hide' : 'Customize'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
