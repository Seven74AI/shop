import { Link } from 'react-router'
import { type Route } from './+types/cgv.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'CGV — Conditions Générales de Vente | Epic Shop' },
	{
		name: 'description',
		content:
			'Conditions Générales de Vente d\'Epic Shop — commande, prix, paiement, livraison, droit de rétractation, retours, garanties, médiation.',
	},
]

export default function CgvRoute() {
	return (
		<div className="container max-w-4xl py-8">
			<h1 className="mb-8 text-3xl font-bold">
				Conditions Générales de Vente (CGV)
			</h1>

			<p className="mb-8 text-muted-foreground">
				Les présentes Conditions Générales de Vente régissent les relations
				contractuelles entre tout utilisateur du site{' '}
				<strong>Epic Shop</strong> (ci-après « le Client ») et la société
				identifiée dans les{' '}
				<Link to="/legal" className="underline hover:text-primary">
					Mentions Légales
				</Link>{' '}
				(ci-après « le Vendeur »). Toute commande passée sur le site implique
				l'acceptation sans réserve des présentes CGV.
			</p>

			{/* 1. Identité du vendeur */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					1. Identité du vendeur
				</h2>
				<p className="text-muted-foreground">
					L'identité complète du vendeur (raison sociale, forme juridique,
					capital social, adresse du siège social, n° SIRET, n° TVA
					intracommunautaire, RCS, directeur de la publication) est disponible
					sur la page{' '}
					<Link to="/legal" className="underline hover:text-primary">
						Mentions Légales
					</Link>
					.
				</p>
			</section>

			{/* 2. Objet et champ d'application */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					2. Objet et champ d'application
				</h2>
				<p className="text-muted-foreground">
					Les présentes CGV s'appliquent à toutes les ventes de produits
					conclues à distance via le site Epic Shop. Elles définissent les
					droits et obligations des parties dans le cadre de la vente en ligne.
					Le Vendeur se réserve le droit de modifier les CGV à tout moment. La
					version applicable à une commande est celle en vigueur au jour de la
					passation de la commande.
				</p>
			</section>

			{/* 3. Commande */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">3. Commande</h2>
				<p className="text-muted-foreground">
					Le Client sélectionne les produits qu'il souhaite acquérir et les
					ajoute à son panier. Il accède au récapitulatif de sa commande, vérifie
					les produits, les quantités et le prix total, puis renseigne ses
					coordonnées de livraison et de facturation. Avant validation définitive,
					le Client doit avoir pris connaissance et accepté les présentes CGV
					(case à cocher). La commande est validée par le clic sur le bouton de
					paiement. Le Vendeur accuse réception de la commande par courrier
					électronique.
				</p>
			</section>

			{/* 4. Prix et TVA */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">4. Prix et TVA</h2>
				<p className="text-muted-foreground">
					Les prix sont indiqués en euros (€), toutes taxes comprises (TTC). La
					TVA applicable est la TVA française au taux en vigueur (article 96 de
					la directive TVA 2006/112/CE). Les frais de livraison sont indiqués
					séparément avant validation de la commande. Le Vendeur se réserve le
					droit de modifier ses prix à tout moment, les produits étant facturés
					au tarif en vigueur au moment de la validation de la commande.
				</p>
			</section>

			{/* 5. Paiement */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">5. Paiement</h2>
				<p className="text-muted-foreground">
					Le paiement s'effectue en ligne par carte bancaire via le prestataire
					de paiement sécurisé Stripe. Le Client garantit qu'il dispose des
					autorisations nécessaires pour utiliser le moyen de paiement choisi.
					La commande ne sera traitée qu'après confirmation de l'accord de
					paiement par Stripe. Les données de paiement sont exclusivement
					traitées par Stripe ; le Vendeur n'a jamais accès aux numéros de
					carte bancaire.
				</p>
			</section>

			{/* 6. Livraison */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">6. Livraison</h2>
				<p className="text-muted-foreground">
					Les produits sont livrés à l'adresse indiquée par le Client lors de
					la commande. La livraison est assurée par Mondial Relay en point
					relais. Les délais de livraison sont indiqués à titre indicatif lors
					de la commande. En cas de retard de livraison excédant 30 jours, le
					Client peut annuler la commande et obtenir le remboursement intégral
					(article L. 216-2 du Code de la consommation). Le risque de perte ou
					d'endommagement des produits est transféré au Client au moment où
					celui-ci (ou un tiers désigné par lui) prend physiquement possession
					des produits.
				</p>
			</section>

			{/* 7. Droit de rétractation */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					7. Droit de rétractation
				</h2>
				<p className="text-muted-foreground">
					Conformément aux articles L. 221-18 et suivants du Code de la
					consommation, le Client dispose d'un délai de{' '}
					<strong>quatorze (14) jours</strong> à compter de la réception du
					produit pour exercer son droit de rétractation, sans avoir à justifier
					de motif ni à payer de pénalités. Pour exercer ce droit, le Client doit
					notifier sa décision de rétractation au Vendeur par une déclaration
					dénuée d'ambiguïté (courrier postal, email, ou formulaire de
					rétractation). Le Client peut utiliser le modèle de formulaire de
					rétractation ci-dessous.
				</p>

				<div className="mt-4 rounded-lg border bg-muted/50 p-4">
					<h3 className="mb-2 font-medium">
						Modèle de formulaire de rétractation
					</h3>
					<p className="text-sm text-muted-foreground">
						(Veuillez compléter et renvoyer ce formulaire uniquement si vous
						souhaitez vous rétracter.)
					</p>
					<address className="mt-2 space-y-1 text-sm not-italic text-muted-foreground">
						<p>À l'attention de : [raison sociale du Vendeur]</p>
						<p>Adresse : [adresse du siège social]</p>
						<p>Email : [email de contact]</p>
						<p className="mt-2">
							Je vous notifie par la présente ma rétractation du contrat portant
							sur la vente du produit ci-dessous :
						</p>
						<p>Produit : ___________________________________</p>
						<p>Commandé le : ___________________________________</p>
						<p>Reçu le : ___________________________________</p>
						<p>Nom du Client : ___________________________________</p>
						<p>Adresse du Client : ___________________________________</p>
						<p className="mt-2">
							Signature du Client (uniquement en cas de notification papier) :
						</p>
						<p>Date : ___________________________________</p>
					</address>
				</div>

				<p className="mt-4 text-muted-foreground">
					Le Client supporte les frais directs de renvoi des produits. Le
					Vendeur rembourse la totalité des sommes versées (y compris les frais
					de livraison standard) dans un délai de quatorze (14) jours à compter
					de la réception de la notification de rétractation. Le remboursement
					peut être différé jusqu'à récupération des produits ou preuve de
					leur expédition.
				</p>
			</section>

			{/* 8. Retours et remboursement */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					8. Retours et remboursement
				</h2>
				<p className="text-muted-foreground">
					Les produits doivent être retournés dans leur état d'origine, complets
					et dans leur emballage d'origine, dans un délai de quatorze (14) jours
					suivant la notification de rétractation. Le Vendeur se réserve le droit
					de refuser le remboursement ou d'appliquer une décote si le produit a
					été utilisé au-delà de ce qui est nécessaire pour établir sa nature,
					ses caractéristiques et son bon fonctionnement (article L. 221-23 du
					Code de la consommation).
				</p>
			</section>

			{/* 9. Garanties légales */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					9. Garantie légale de conformité et garantie des vices cachés
				</h2>
				<p className="text-muted-foreground">
					Tous les produits vendus bénéficient de la garantie légale de
					conformité (articles L. 217-3 à L. 217-14 du Code de la consommation)
					pendant un délai de <strong>deux (2) ans</strong> à compter de la
					délivrance du produit. Le Client peut choisir entre la réparation
					gratuite ou le remplacement du produit, sous réserve des conditions de
					coût prévues par la loi. Le Client est dispensé de rapporter la preuve
					de l'existence du défaut de conformité durant les douze (12) mois
					suivant la délivrance du produit (vingt-quatre mois pour les produits
					neufs à compter du 1er janvier 2022).
				</p>
				<p className="mt-2 text-muted-foreground">
					Le Client bénéficie également de la garantie légale des vices cachés
					(articles 1641 à 1649 du Code civil) pendant un délai de deux (2) ans
					à compter de la découverte du vice. Cette garantie permet au Client
					d'obtenir une réduction du prix ou la résolution de la vente si le vice
					rend le produit impropre à l'usage auquel on le destine.
				</p>
			</section>

			{/* 10. Réclamation et médiation */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					10. Réclamation et médiation
				</h2>
				<p className="text-muted-foreground">
					Toute réclamation doit être adressée au Vendeur par email à l'adresse
					indiquée dans les{' '}
					<Link to="/legal" className="underline hover:text-primary">
						Mentions Légales
					</Link>
					. Le Vendeur s'engage à répondre dans un délai de quatorze (14) jours
					ouvrés.
				</p>
				<p className="mt-2 text-muted-foreground">
					Conformément à l'article L. 612-1 du Code de la consommation, le
					Client peut recourir gratuitement au service de médiation suivant :
					<br />
					<a
						href="https://ec.europa.eu/consumers/odr/"
						className="underline hover:text-primary"
						target="_blank"
						rel="noopener noreferrer"
					>
						Plateforme de règlement en ligne des litiges de la Commission
						européenne
					</a>
					.
				</p>
			</section>

			{/* 11. Données personnelles */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					11. Données personnelles
				</h2>
				<p className="text-muted-foreground">
					Le Vendeur collecte et traite les données personnelles du Client
					conformément au Règlement Général sur la Protection des Données (RGPD)
					et à la loi Informatique et Libertés. Pour plus d'informations,
					veuillez consulter notre{' '}
					<Link to="/privacy" className="underline hover:text-primary">
						Politique de Confidentialité
					</Link>
					.
				</p>
			</section>

			{/* 12. Loi applicable et juridiction */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					12. Loi applicable et juridiction
				</h2>
				<p className="text-muted-foreground">
					Les présentes CGV sont soumises au droit français. En cas de litige,
					les tribunaux français seront seuls compétents, sous réserve des
					dispositions impératives du droit de l'Union européenne en matière de
					compétence judiciaire (Règlement Bruxelles I bis).
				</p>
			</section>

			{/* Date de dernière mise à jour */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					13. Date de dernière mise à jour
				</h2>
				<p className="text-muted-foreground">
					Dernière mise à jour : <strong>20 mai 2026</strong>.
				</p>
			</section>
		</div>
	)
}
