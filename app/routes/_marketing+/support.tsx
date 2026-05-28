import { Link } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
import type { Route } from './+types/support.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Support | Epic Shop' },
	{
		name: 'description',
		content:
			'Contact Epic Shop customer support. Access our terms of sale, terms of use, and privacy policy.',
	},
]

export default function SupportRoute() {
	const { t } = useTranslation()
	return (
		<div className="container mx-auto max-w-2xl px-4 py-12">
			<h1 className="mb-6 text-3xl font-bold tracking-tight">
				{t('marketing.support')}
			</h1>

			<div className="prose prose-neutral max-w-none space-y-6">
				<section>
					<h2 className="text-xl font-semibold">{t('marketing.support.contact')}</h2>
					<p className="text-muted-foreground">
						{t('marketing.support.contactBody')}
					</p>
					<ul className="list-disc pl-5 text-muted-foreground">
						<li>
							{t('marketing.support.emailLabel')}{' '}
							<a
								href="mailto:support@epic-shop.fr"
								className="text-primary underline"
							>
								support@epic-shop.fr
							</a>
						</li>
						<li>
							{t('marketing.support.address')}
						</li>
						<li>{t('marketing.support.responseTime')}</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold">{t('marketing.support.legalInfo')}</h2>
					<ul className="list-disc pl-5 text-muted-foreground">
						<li>
							<Link to="/cgv" className="text-primary underline">
								{t('footer.cgv')} — {t('marketing.cgv.title')}
							</Link>
						</li>
						<li>
							<Link to="/mentions-legales" className="text-primary underline">
								{t('marketing.mentionsLegales.title')}
							</Link>
						</li>
						<li>
							<Link to="/tos" className="text-primary underline">
								{t('footer.tos')}
							</Link>
						</li>
						<li>
							<Link to="/privacy" className="text-primary underline">
								{t('footer.privacy')}
							</Link>
						</li>
					</ul>
				</section>
			</div>
		</div>
	)
}
