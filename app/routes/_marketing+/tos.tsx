import { Link } from 'react-router'
import { type Route } from './+types/tos.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Terms of Service | Epic Shop' },
	{
		name: 'description',
		content:
			'Terms of Service for Epic Shop — website use, account rules, intellectual property, acceptable use, and contact information.',
	},
]

export default function TermsOfServiceRoute() {
	return (
		<div className="container max-w-4xl py-8">
			<h1 className="mb-8 text-3xl font-bold">Terms of Service</h1>

			<p className="mb-8 text-muted-foreground">
				Welcome to Epic Shop. By accessing or using our website, you agree to
				be bound by these Terms of Service. If you do not agree, please do not
				use the site. These terms apply to your use of the website and do not
				govern the sale of products — for purchasing terms, please refer to our{' '}
				<Link to="/cgv" className="underline hover:text-primary">
					Conditions Générales de Vente (CGV)
				</Link>
				.
			</p>

			{/* 1. Definitions */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">1. Definitions</h2>
				<p className="text-muted-foreground">
					&quot;Site&quot; refers to Epic Shop, accessible at its primary domain.
					&quot;We&quot;, &quot;us&quot;, &quot;our&quot; refers to the company
					identified in the{' '}
					<Link to="/legal" className="underline hover:text-primary">
						Mentions Légales
					</Link>
					. &quot;You&quot;, &quot;your&quot; refers to the user or visitor of
					the Site.
				</p>
			</section>

			{/* 2. Account */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">2. Account</h2>
				<p className="text-muted-foreground">
					You may create an account to access certain features. You are
					responsible for maintaining the confidentiality of your credentials
					and for all activity under your account. You must provide accurate
					and complete information. We reserve the right to suspend or terminate
					accounts that violate these terms.
				</p>
			</section>

			{/* 3. Intellectual Property */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					3. Intellectual Property
				</h2>
				<p className="text-muted-foreground">
					All content on the Site — including text, graphics, logos, images,
					icons, software, and the overall design — is our exclusive property
					or the property of our licensors. It is protected by French and
					international copyright, trademark, and intellectual property laws.
					You may not reproduce, distribute, modify, or create derivative works
					without our prior written consent.
				</p>
			</section>

			{/* 4. Acceptable Use */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">4. Acceptable Use</h2>
				<p className="text-muted-foreground">
					You agree not to:
				</p>
				<ul className="ml-6 mt-2 list-disc space-y-1 text-muted-foreground">
					<li>
						Use the Site in any way that violates applicable laws or
						regulations
					</li>
					<li>
						Attempt to gain unauthorized access to the Site, servers, or
						networks
					</li>
					<li>
						Interfere with or disrupt the Site's operation or integrity
					</li>
					<li>
						Transmit malware, viruses, or any malicious code
					</li>
					<li>
						Use automated means (bots, scrapers) to access the Site without
						permission
					</li>
					<li>
						Engage in any activity that could damage, disable, or overburden
						the Site
					</li>
				</ul>
			</section>

			{/* 5. Third-Party Links */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">5. Third-Party Links</h2>
				<p className="text-muted-foreground">
					The Site may contain links to third-party websites (e.g., Stripe for
					payments, Fly.io for hosting). We are not responsible for the content
					or practices of third-party sites. Accessing them is at your own risk.
				</p>
			</section>

			{/* 6. Disclaimer */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">6. Disclaimer</h2>
				<p className="text-muted-foreground">
					The Site is provided &quot;as is&quot; without warranties of any
					kind. We do not guarantee that the Site will be uninterrupted,
					error-free, or secure. To the fullest extent permitted by law, we
					disclaim all warranties, express or implied.
				</p>
			</section>

			{/* 7. Limitation of Liability */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">
					7. Limitation of Liability
				</h2>
				<p className="text-muted-foreground">
					We shall not be liable for any indirect, incidental, special, or
					consequential damages arising from your use of the Site. Our total
					liability is limited to the amount you paid us, if any, in the twelve
					months preceding the claim. Nothing in these terms excludes liability
					for fraud, death, or personal injury.
				</p>
			</section>

			{/* 8. Changes */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">8. Changes</h2>
				<p className="text-muted-foreground">
					We may update these Terms of Service from time to time. Changes are
					effective upon posting. Your continued use of the Site after changes
					constitutes acceptance of the revised terms.
				</p>
			</section>

			{/* 9. Contact */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">9. Contact</h2>
				<p className="text-muted-foreground">
					For questions about these Terms of Service, contact us at the email
					address listed in our{' '}
					<Link to="/legal" className="underline hover:text-primary">
						Mentions Légales
					</Link>
					.
				</p>
			</section>

			{/* Last updated */}
			<section className="mb-8">
				<h2 className="mb-4 text-xl font-semibold">10. Last Updated</h2>
				<p className="text-muted-foreground">
					These Terms of Service were last updated on <strong>May 20, 2026</strong>.
				</p>
			</section>
		</div>
	)
}
