import { Link } from 'react-router'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './two-factor.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	
	const twoFactorVerification = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { type: twoFAVerificationType, target: userId } },
	})

	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})

	return {
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
	}
}

function SettingItem({ 
	icon, 
	title, 
	description, 
	to,
}: { 
	icon: React.ReactNode; 
	title: string; 
	description: string;
	to: string;
}) {
	return (
		<Link
			to={to}
			className="w-full text-left p-4 rounded-lg transition-colors group flex items-start gap-4 border border-transparent hover:border-[rgba(0,0,0,0.1)] hover:bg-[#F3F3F5]"
		>
			<div className="mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" style={{ color: '#717182' }}>
				{icon}
			</div>
			<div className="flex-1 min-w-0">
				<div className="mb-1" style={{ color: '#0A0A0A' }}>
					{title}
				</div>
				<div className="text-sm" style={{ color: '#717182' }}>
					{description}
				</div>
			</div>
			<Icon name="arrow-right" className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: '#717182' }} />
		</Link>
	)
}

export default function SecurityIndex({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	return (
		<div className="space-y-6">
			<Card className="p-8">
				<h2 className="mb-2" style={{ fontSize: '16px', lineHeight: '1.5em', fontWeight: 400, color: '#0A0A0A' }}>
					{t('account.security.title')}
				</h2>
				<p className="text-sm mb-6" style={{ color: '#717182' }}>
					{t('account.security.description')}
				</p>

				<div className="space-y-2">
					<SettingItem 
						icon={<Icon name="lock-closed" className="w-5 h-5" />}
						title={loaderData.hasPassword ? t('account.security.changePassword') : t('account.security.createPassword')}
						description={loaderData.hasPassword ? t('account.security.updatePassword') : t('account.security.setPassword')}
						to={loaderData.hasPassword ? 'password' : 'password/create'}
					/>
					<SettingItem 
						icon={<Icon name="shield" className="w-5 h-5" />}
						title={loaderData.isTwoFactorEnabled ? t('account.security.2faEnabled') : t('account.security.enable2fa')}
						description={loaderData.isTwoFactorEnabled ? t('account.security.2faActive') : t('account.security.2faDescription')}
						to="two-factor"
					/>
					<SettingItem 
						icon={<Icon name="smartphone" className="w-5 h-5" />}
						title={t('account.security.manageProviders')}
						description={t('account.security.providersDescription')}
						to="passkeys"
					/>
					<SettingItem 
						icon={<Icon name="link-2" className="w-5 h-5" />}
						title={t('account.security.manageConnections')}
						description={t('account.security.connectionsDescription')}
						to="connections"
					/>
				</div>
			</Card>
		</div>
	)
}

