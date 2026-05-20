import { getCompanySettings } from '#app/utils/settings.server.ts'
import { type Route } from './+types/legal.ts'

export async function loader(_: Route.LoaderArgs) {
	const company = await getCompanySettings()
	return { company }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Mentions Légales | Epic Shop' },
	{ name: 'description', content: 'Mentions légales du site Epic Shop — informations légales requises par la loi française (LCEN art. 6).' },
]

export default function LegalRoute({ loaderData }: Route.ComponentProps) {
	const { company } = loaderData

	return (
		<div className="container py-8 max-w-4xl">
			<h1 className="text-3xl font-bold mb-8">Mentions Légales</h1>

			<p className="text-muted-foreground mb-8">
				Conformément aux dispositions des articles 6-III et 19 de la Loi pour la Confiance dans
				l'Économie Numérique (LCEN n° 2004-575 du 21 juin 2004), nous portons à la connaissance
				des utilisateurs du site <strong>Epic Shop</strong> les informations suivantes.
			</p>

			<section className="mb-8">
				<h2 className="text-xl font-semibold mb-4">1. Éditeur du site</h2>
				<dl className="space-y-2">
					{company.companyLegalName && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">Raison sociale :</dt>
							<dd>{company.companyLegalName}</dd>
						</div>
					)}
					{company.companyLegalForm && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">Forme juridique :</dt>
							<dd>{company.companyLegalForm}</dd>
						</div>
					)}
					{company.companyCapital && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">Capital social :</dt>
							<dd>{company.companyCapital}</dd>
						</div>
					)}
					{company.headOfficeAddress && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">Adresse du siège social :</dt>
							<dd className="whitespace-pre-line">{company.headOfficeAddress}</dd>
						</div>
					)}
					{company.siret && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">N° SIRET :</dt>
							<dd>{company.siret}</dd>
						</div>
					)}
					{company.rcs && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">RCS :</dt>
							<dd>{company.rcs}</dd>
						</div>
					)}
					{company.vatNumber && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">N° TVA intracommunautaire :</dt>
							<dd>{company.vatNumber}</dd>
						</div>
					)}
					{company.directorName && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">Directeur de la publication :</dt>
							<dd>{company.directorName}</dd>
						</div>
					)}
					{company.directorContactEmail && (
						<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
							<dt className="font-medium">Contact :</dt>
							<dd>
								<a href={`mailto:${company.directorContactEmail}`} className="underline hover:text-primary">
									{company.directorContactEmail}
								</a>
							</dd>
						</div>
					)}
				</dl>
				{!company.companyLegalName && (
					<p className="text-muted-foreground italic mt-2">
						Les informations sur l'éditeur seront renseignées prochainement.
					</p>
				)}
			</section>

			<section className="mb-8">
				<h2 className="text-xl font-semibold mb-4">2. Hébergeur</h2>
				<dl className="space-y-2">
					<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
						<dt className="font-medium">Hébergeur :</dt>
						<dd>Fly.io, Inc.</dd>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
						<dt className="font-medium">Site web :</dt>
						<dd>
							<a href="https://fly.io" className="underline hover:text-primary" rel="noopener noreferrer" target="_blank">
								https://fly.io
							</a>
						</dd>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
						<dt className="font-medium">Contact :</dt>
						<dd>
							<a href="https://fly.io/docs/about/" className="underline hover:text-primary" rel="noopener noreferrer" target="_blank">
								https://fly.io/docs/about/
							</a>
						</dd>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
						<dt className="font-medium">Points de présence :</dt>
						<dd>Paris (CDG), Francfort (FRA), et autres localisations mondiales</dd>
					</div>
				</dl>
			</section>

			<section className="mb-8">
				<h2 className="text-xl font-semibold mb-4">3. Propriété intellectuelle</h2>
				<p className="text-muted-foreground">
					L'ensemble du contenu du site Epic Shop (structure, textes, images, logos, marques) est
					protégé par le droit d'auteur et le droit des marques. Toute reproduction, représentation,
					modification, publication, adaptation totale ou partielle est interdite sans autorisation
					préalable.
				</p>
			</section>

			<section className="mb-8">
				<h2 className="text-xl font-semibold mb-4">4. Données personnelles</h2>
				<p className="text-muted-foreground">
					Pour plus d'informations sur la collecte et le traitement de vos données personnelles,
					veuillez consulter notre{' '}
					<a href="/privacy" className="underline hover:text-primary">
						Politique de Confidentialité
					</a>
					.
				</p>
			</section>

			<section className="mb-8">
				<h2 className="text-xl font-semibold mb-4">5. Droit applicable</h2>
				<p className="text-muted-foreground">
					Les présentes mentions légales sont soumises au droit français. En cas de litige,
					les tribunaux français seront seuls compétents.
				</p>
			</section>
		</div>
	)
}
