import * as Sentry from '@sentry/react-router'
import { OpenImgContextProvider } from 'openimg/react'
import {
	data,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useMatches,
} from 'react-router'
import { HoneypotProvider } from 'remix-utils/honeypot/react'
import { type Route } from './+types/root.ts'
import appleTouchIconAssetUrl from './assets/favicons/apple-touch-icon.png'
import faviconAssetUrl from './assets/favicons/favicon.svg'
import { CartBadge } from './components/cart-badge.tsx'
import { GeneralErrorBoundary } from './components/error-boundary.tsx'
import { EpicProgress } from './components/progress-bar.tsx'
import { SearchBar } from './components/search-bar.tsx'
import { useToast } from './components/toaster.tsx'
import { Button } from './components/ui/button.tsx'
import { href as iconsHref } from './components/ui/icon.tsx'
import { EpicToaster } from './components/ui/sonner.tsx'
import { UserDropdown } from './components/user-dropdown.tsx'
import { LocaleSwitcher } from './components/locale-switcher.tsx'
import {
	ThemeSwitch,
	useOptionalTheme,
	useTheme,
} from './routes/resources+/theme-switch.tsx'
import tailwindStyleSheetUrl from './styles/tailwind.css?url'
import { getUserId, logout } from './utils/auth.server.ts'
import { getOrCreateCartFromRequest } from './utils/cart.server.ts'
import { ClientHintCheck, getHints } from './utils/client-hints.tsx'
import { prisma } from './utils/db.server.ts'
import { getEnv } from './utils/env.server.ts'
import { pipeHeaders } from './utils/headers.server.ts'
import { honeypot } from './utils/honeypot.server.ts'
import { combineHeaders, getDomainUrl, getImgSrc } from './utils/misc.tsx'
import { useNonce } from './utils/nonce-provider.ts'
import { type Theme, getTheme } from './utils/theme.server.ts'
import { makeTimings, time } from './utils/timing.server.ts'
import { getToast } from './utils/toast.server.ts'
import { useOptionalUser } from './utils/user.ts'
import {
	type Locale,
	getLocale,
	getTranslations,
} from './utils/i18n.server.ts'
import { TranslationProvider } from './utils/i18n.tsx'

export const links: Route.LinksFunction = () => {
	return [
		// Preload svg sprite as a resource to avoid render blocking
		{ rel: 'preload', href: iconsHref, as: 'image' },
		{
			rel: 'icon',
			href: '/favicon.ico',
			sizes: '48x48',
		},
		{ rel: 'icon', type: 'image/svg+xml', href: faviconAssetUrl },
		{ rel: 'apple-touch-icon', href: appleTouchIconAssetUrl },
		{
			rel: 'manifest',
			href: '/site.webmanifest',
			crossOrigin: 'use-credentials',
		} as const, // necessary to make typescript happy
		{ rel: 'stylesheet', href: tailwindStyleSheetUrl },
	].filter(Boolean)
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const locale = (loaderData?.locale as Locale) ?? 'en'
	const origin = loaderData?.requestInfo?.origin ?? 'https://epicnotes.fly.dev'
	const path = loaderData?.requestInfo?.path ?? '/'
	const canonicalUrl = `${origin}${path}`
	return [
		{ title: loaderData ? 'Epic Notes' : 'Error | Epic Notes' },
		{ name: 'description', content: `Your own captain's log` },
		{ tagName: 'link', rel: 'canonical', href: canonicalUrl },
		{
			tagName: 'link',
			rel: 'alternate',
			href: canonicalUrl,
			hreflang: 'en',
		},
		{
			tagName: 'link',
			rel: 'alternate',
			href: canonicalUrl,
			hreflang: 'fr',
		},
		{
			tagName: 'link',
			rel: 'alternate',
			href: canonicalUrl,
			hreflang: 'x-default',
		},
	]
}

export async function loader({ request }: Route.LoaderArgs) {
	const timings = makeTimings('root loader')
	const userId = await time(() => getUserId(request), {
		timings,
		type: 'getUserId',
		desc: 'getUserId in root',
	})

	const user = userId
		? await time(
				() =>
					prisma.user.findUnique({
						select: {
							id: true,
							name: true,
							username: true,
							image: { select: { objectKey: true } },
							roles: {
								select: {
									name: true,
									permissions: {
										select: { entity: true, action: true, access: true },
									},
								},
							},
						},
						where: { id: userId },
					}),
				{ timings, type: 'find user', desc: 'find user in root' },
			)
		: null
	if (userId && !user) {
		// User is authenticated but not found in database - log and logout
		Sentry.captureMessage('Authenticated user not found in database', {
			level: 'warning',
			tags: { context: 'root-loader' },
			extra: { userId },
		})
		await logout({ request, redirectTo: '/' })
	}

	// Get cart count for all users (guest or authenticated)
	let cartCount = 0
	try {
		const { cart } = await getOrCreateCartFromRequest(request)
		cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0
	} catch (error) {
		// If cart creation fails, just default to 0
		Sentry.captureException(error, {
			tags: { context: 'root-cart-count' },
		})
	}

	const { toast, headers: toastHeaders } = await getToast(request)
	const honeyProps = await honeypot.getInputProps()

	// i18n: detect locale and load translations
	const locale = getLocale(request)
	const translations = await getTranslations(locale)

	return data(
		{
			user,
			cartCount,
			locale,
			translations,
			requestInfo: {
				hints: getHints(request),
				origin: getDomainUrl(request),
				path: new URL(request.url).pathname,
				userPrefs: {
					theme: getTheme(request),
				},
			},
			ENV: getEnv(),
			toast,
			honeyProps,
		},
		{
			headers: combineHeaders(
				{ 'Server-Timing': timings.toString() },
				toastHeaders,
			),
		},
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

function Document({
	children,
	nonce,
	theme = 'light',
	locale = 'en',
	env = {},
}: {
	children: React.ReactNode
	nonce: string
	theme?: Theme
	locale?: string
	env?: Record<string, string | undefined>
}) {
	const allowIndexing = ENV.ALLOW_INDEXING !== 'false'
	return (
		<html lang={locale} className={`${theme} h-full overflow-x-hidden`}>
			<head>
				<ClientHintCheck nonce={nonce} />
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				{allowIndexing ? null : (
					<meta name="robots" content="noindex, nofollow" />
				)}
				<Links />
			</head>
			<body className="bg-background text-foreground">
				{children}
				<script
					nonce={nonce}
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />
			</body>
		</html>
	)
}

export function Layout({ children }: { children: React.ReactNode }) {
	// if there was an error running the loader, data could be missing
	const data = useLoaderData<typeof loader | null>()
	const nonce = useNonce()
	const theme = useOptionalTheme()
	const locale = (data?.locale as string) ?? 'en'
	return (
		<Document nonce={nonce} theme={theme} locale={locale} env={data?.ENV}>
			{children}
		</Document>
	)
}

function App() {
	const data = useLoaderData<typeof loader>()
	const user = useOptionalUser()
	const theme = useTheme()
	const matches = useMatches()
	const isOnSearchPage = matches.find((m) => m.id === 'routes/users+/index')
	const isOnAdminPage = matches.some((m) => m.id?.includes('routes/admin+'))
	const searchBar = isOnSearchPage ? null : <SearchBar status="idle" />
	useToast(data.toast)

	// If we're on an admin page, render without the main site header/footer
	// The admin layout will handle its own header/footer
	if (isOnAdminPage) {
		return (
			<OpenImgContextProvider
				optimizerEndpoint="/resources/images"
				getSrc={getImgSrc}
			>
				<div className="min-h-screen bg-background">
					<Outlet />
				</div>
				<EpicToaster closeButton position="bottom-center" theme={theme} />
				<EpicProgress />
			</OpenImgContextProvider>
		)
	}

	// Main site layout with header and footer
	return (
		<OpenImgContextProvider
			optimizerEndpoint="/resources/images"
			getSrc={getImgSrc}
		>
			<div className="flex min-h-screen flex-col justify-between">
				<header className="container py-6">
					<nav aria-label="Main navigation" className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap md:gap-8">
						<Logo />
						<div className="ml-auto hidden max-w-sm flex-1 sm:block">
							{searchBar}
						</div>
						<div className="flex items-center gap-6">
							<Button variant="ghost" asChild>
								<Link to="/shop">Shop</Link>
							</Button>
							<CartBadge count={data.cartCount} />
							{user ? (
								<UserDropdown />
							) : (
								<Button asChild variant="default" size="lg">
									<Link to="/login">Log In</Link>
								</Button>
							)}
						</div>
						<div className="block w-full sm:hidden">{searchBar}</div>
					</nav>
				</header>

			<main className="flex flex-1 flex-col">
				<Outlet />
			</main>

			<footer className="container flex justify-between pb-5">
				<Logo />
				<div className="flex items-center gap-4">
					<LocaleSwitcher />
					<ThemeSwitch userPreference={data.requestInfo.userPrefs.theme} />
				</div>
			</footer>
			</div>
			<EpicToaster closeButton position="bottom-center" theme={theme} />
			<EpicProgress />
		</OpenImgContextProvider>
	)
}

function Logo() {
	return (
		<Link to="/" className="group grid leading-snug">
			<span className="font-light transition group-hover:-translate-x-1">
				epic
			</span>
			<span className="font-bold transition group-hover:translate-x-1">
				notes
			</span>
		</Link>
	)
}

function AppWithProviders() {
	const data = useLoaderData<typeof loader>()
	return (
		<HoneypotProvider {...data.honeyProps}>
			<TranslationProvider>
				<App />
			</TranslationProvider>
		</HoneypotProvider>
	)
}

export default AppWithProviders

// this is a last resort error boundary. There's not much useful information we
// can offer at this level.
export const ErrorBoundary = GeneralErrorBoundary
