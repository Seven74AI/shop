import { invariantResponse } from '@epic-web/invariant'
import React from 'react'
import { Link, Outlet, useLocation, useMatches } from 'react-router'
import { z } from 'zod'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type Route } from './+types/account.ts'

export const BreadcrumbHandle = z.object({ breadcrumb: z.union([z.string(), z.any()]) })
export type BreadcrumbHandle = z.infer<typeof BreadcrumbHandle>

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Settings',
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { username: true },
	})
	invariantResponse(user, 'User not found', { status: 404 })
	return {}
}

const BreadcrumbHandleMatch = z.object({
	handle: BreadcrumbHandle,
})

function SidebarButton({
	icon,
	label,
	to,
	active,
}: {
	icon: React.ReactNode
	label: string
	to: string
	active: boolean
}) {
	return (
		<Link
			to={to}
			className={cn(
				'w-full flex items-center gap-3 px-4 py-3 rounded-[10px] transition-all',
				active
					? 'bg-[#ECEEF2] text-[#030213]'
					: 'text-[#717182] hover:bg-[#E9EBEF] hover:text-[#030213]'
			)}
		>
			{icon}
			<span className="text-sm">{label}</span>
		</Link>
	)
}

export default function AccountLayout() {
	const { t } = useTranslation()
	const location = useLocation()
	const matches = useMatches()
	const breadcrumbs = matches
		.map((m) => {
			const result = BreadcrumbHandleMatch.safeParse(m)
			if (!result.success || !result.data.handle.breadcrumb) return null
			// Skip the parent account.tsx route's breadcrumb ("Settings") - we use "Account" as root instead
			if (m.pathname === '/account' && m.id?.includes('routes/account')) return null
			const breadcrumbValue = result.data.handle.breadcrumb
			return {
				text: typeof breadcrumbValue === 'string' ? breadcrumbValue : String(breadcrumbValue),
				path: m.pathname,
			}
		})
		.filter(Boolean) as { text: string; path: string }[]

	// Determine active section based on current route
	const pathname = location.pathname
	const isProfile = pathname === '/account'
	const isOrders = pathname.startsWith('/account/orders')
	const isInvoices = pathname.startsWith('/account/invoices')
	const isAddresses = pathname.startsWith('/account/addresses')
	const isSecurity = pathname.startsWith('/account/security')
	const isPrivacy = pathname.startsWith('/account/privacy') || pathname.includes('/download-user-data')

	return (
		<div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
			<h1 className="sr-only">Account Settings</h1>
			<div className="max-w-7xl mx-auto px-4 py-8">
				{/* Breadcrumb */}
				{pathname === '/account' ? (
					<div className="mb-8 text-sm">
						<span style={{ color: '#0A0A0A' }}>{t('account.layout.account')}</span>
					</div>
				) : (
					<div className="flex items-center gap-2 mb-8 text-sm">
						<Link
							to="/account"
							className="hover:opacity-80 transition-opacity inline-flex items-center"
							style={{ color: '#717182' }}
						>
							{t('account.layout.account')}
						</Link>
						{breadcrumbs.map((breadcrumb, i, arr) => (
							<React.Fragment key={i}>
								<Icon name="arrow-right" className="w-4 h-4" style={{ color: '#717182' }} />
								<Link
									to={breadcrumb.path}
									className="inline-flex items-center"
									style={{
										color: i === arr.length - 1 ? '#0A0A0A' : '#717182'
									}}
								>
									{breadcrumb.text}
								</Link>
							</React.Fragment>
						))}
					</div>
				)}
				
				<div className="flex flex-col lg:flex-row gap-6">
					{/* Sidebar Navigation */}
					<aside className="lg:w-64 flex-shrink-0">
						<Card className="p-2" style={{ borderRadius: '14px' }}>
							<nav aria-label="Account navigation" className="space-y-1">
						<SidebarButton
							icon={<Icon name="user" className="w-5 h-5" />}
							label={t('account.layout.profile')}
							to="/account"
							active={isProfile}
						/>
					<SidebarButton
						icon={<Icon name="package" className="w-5 h-5" />}
						label={t('account.layout.orders')}
						to="/account/orders"
						active={isOrders}
					/>
					<SidebarButton
						icon={<Icon name="file-text" className="w-5 h-5" />}
						label={t('account.layout.invoices')}
						to="/account/invoices"
						active={isInvoices}
					/>
					<SidebarButton
						icon={<Icon name="map-pin" className="w-5 h-5" />}
						label={t('account.layout.addresses')}
						to="/account/addresses"
						active={isAddresses}
					/>
						<SidebarButton
							icon={<Icon name="shield" className="w-5 h-5" />}
							label={t('account.layout.security')}
							to="/account/security"
							active={isSecurity}
						/>
						<SidebarButton
							icon={<Icon name="database" className="w-5 h-5" />}
							label={t('account.layout.privacy')}
							to="/account/privacy"
							active={isPrivacy}
						/>
							</nav>
						</Card>
					</aside>

					{/* Main Content */}
					<div className="flex-1 min-w-0">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}

