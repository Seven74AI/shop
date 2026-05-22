import { Link } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
import type { Route } from './+types/support.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Support | Epic Shop' },
	{
		name: 'description',
		content:
			'Contactez le support client Epic Shop. Accédez à nos CGV, conditions d\'utilisation et politique de confidentialité.',
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
					<h2 className="text-xl font-semibold">Contact</h2>
					<p className="text-muted-foreground">
						Pour toute question relative à votre commande, nos produits ou nos
						services, notre équipe est à votre disposition :
					</p>
					<ul className="list-disc pl-5 text-muted-foreground">
						<li>
							Email :{' '}
							<a
								href="mailto:support@epic-shop.fr"
								className="text-primary underline"
							>
								support@epic-shop.fr
							</a>
						</li>
						<li>
							Adresse postale : Epic Shop, 1 rue de la Paix, 75002 Paris,
							France
						</li>
						<li>Délai de réponse : sous 48 heures ouvrées</li>
					</ul>
				</section>

				<section>
					<h2 className="text-xl font-semibold">Informations légales</h2>
					<ul className="list-disc pl-5 text-muted-foreground">
						<li>
							<Link to="/cgv" className="text-primary underline">
								{t('footer.cgv')} — Conditions Générales de Vente
							</Link>
						</li>
						<li>
							<Link to="/tos" className="text-primary underline">
								{t('footer.tos')} — Conditions d'utilisation du site
							</Link>
						</li>
						<li>
							<Link to="/privacy" className="text-primary underline">
								{t('footer.privacy')} — Politique de confidentialité et RGPD
							</Link>
						</li>
					</ul>
				</section>
			</div>
		</div>
	)
}
