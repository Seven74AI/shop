import { Outlet, useLoaderData } from 'react-router'
import { CheckoutSteps, type CheckoutStep } from '#app/components/checkout/checkout-steps.tsx'
import { useTranslation } from '#app/utils/i18n.tsx'
import { type Route } from './+types/_layout.ts'



export default function CheckoutLayout() {
	const loaderData = useLoaderData<Route.LoaderData>()
	const { t } = useTranslation()
	const currentStep = loaderData?.currentStep || 'review'

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<h1 className="mb-8 text-center text-3xl font-bold">{t('shop.checkout.title')}</h1>
			<CheckoutSteps currentStep={currentStep} />
			<div className="min-h-[400px]">
				<Outlet />
			</div>
		</div>
	)
}
