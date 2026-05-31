import { redirect, Link, useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { type Route } from './+types/two-factor.index.ts'
import { twoFAVerificationType } from './two-factor.tsx'
import { useTranslation } from '#app/utils/i18n.tsx'
import { twoFAVerifyVerificationType } from './two-factor.verify.tsx'


export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: { target_type: { type: twoFAVerificationType, target: userId } },
		select: { id: true },
	})
	return { is2FAEnabled: Boolean(verification) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const { otp: _otp, ...config } = await generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
	}
	await prisma.verification.upsert({
		where: {
			target_type: { target: userId, type: twoFAVerifyVerificationType },
		},
		create: verificationData,
		update: verificationData,
	})
	return redirect('/account/security/two-factor/verify')
}

export default function TwoFactorRoute({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const enable2FAFetcher = useFetcher<typeof action>()

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('account.security.2fa.title')}</h1>
					<p className="text-gray-600">
						{t('account.security.2faDescription')}
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						{t('account.security.2fa.backToSettings')}
					</Link>
				</Button>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-red-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
							<Icon name="shield" className="w-5 h-5 text-red-700" />
						</div>
						<CardTitle className="text-lg">{t('account.security.2fa.status')}</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0 space-y-6">
					{loaderData.is2FAEnabled ? (
						<>
							<div className="flex items-center gap-2 text-gray-900">
								<Icon name="check" className="text-green-600" />
								<p className="text-lg">
									{t('account.security.2fa.enabledMessage')}
								</p>
							</div>
							<div className="flex justify-end pt-6 border-t">
								<Button variant="destructive" asChild>
									<Link to="disable">
										<Icon name="lock-open-1" className="h-4 w-4 mr-2" />
										{t('account.security.2fa.disable')}
									</Link>
								</Button>
							</div>
						</>
					) : (
						<>
							<div className="flex items-center gap-2 text-gray-900">
								<Icon name="lock-open-1" className="text-gray-600" />
								<p>
									{t('account.security.2fa.disabledMessage')}
								</p>
							</div>
							<p className="text-sm text-gray-600">
								{t('account.security.2fa.explanation')}
							</p>
							<div className="flex justify-end pt-6 border-t">
								<enable2FAFetcher.Form method="POST">
									<StatusButton
										type="submit"
										name="intent"
										value="enable"
										status={enable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
									>
										{t('account.security.2fa.enable')}
									</StatusButton>
								</enable2FAFetcher.Form>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
