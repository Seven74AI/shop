import { useTranslation } from '#app/utils/i18n.tsx'
import type { Route } from './+types/cgv.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Terms of Sale (CGV) | Epic Shop' },
	{
		name: 'description',
		content:
			'General Terms and Conditions of Sale — scope, products, prices, payment, delivery, right of withdrawal, warranties, liability, data protection.',
	},
]

export default function CgvRoute() {
	const { t } = useTranslation()

	const sections = [
		{
			title: t('marketing.cgv.section1.title'),
			body: t('marketing.cgv.section1.body'),
		},
		{
			title: t('marketing.cgv.section2.title'),
			body: t('marketing.cgv.section2.body'),
		},
		{
			title: t('marketing.cgv.section3.title'),
			body: t('marketing.cgv.section3.body'),
		},
		{
			title: t('marketing.cgv.section4.title'),
			body: t('marketing.cgv.section4.body'),
		},
		{
			title: t('marketing.cgv.section5.title'),
			body: t('marketing.cgv.section5.body'),
		},
		{
			title: t('marketing.cgv.section6.title'),
			body: t('marketing.cgv.section6.body'),
		},
		{
			title: t('marketing.cgv.section7.title'),
			body: t('marketing.cgv.section7.body'),
		},
		{
			title: t('marketing.cgv.section8.title'),
			body: t('marketing.cgv.section8.body'),
		},
		{
			title: t('marketing.cgv.section9.title'),
			body: t('marketing.cgv.section9.body'),
		},
		{
			title: t('marketing.cgv.section10.title'),
			body: t('marketing.cgv.section10.body'),
		},
	]

	return (
		<article className="container mx-auto max-w-3xl px-4 py-12">
			<h1 className="mb-2 text-3xl font-bold tracking-tight">
				{t('marketing.cgv.title')}
			</h1>
			<p className="mb-8 text-sm text-muted-foreground">
				{t('marketing.cgv.lastUpdated')}
			</p>

			<div className="prose prose-neutral max-w-none space-y-8">
				{sections.map((s, i) => (
					<section key={i}>
						<h2 className="mb-3 text-xl font-semibold">
							{i + 1}. {s.title}
						</h2>
						<p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
							{s.body}
						</p>
					</section>
				))}
			</div>
		</article>
	)
}
