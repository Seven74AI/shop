import { useTranslation } from '#app/utils/i18n.tsx'

export default function TermsOfServiceRoute() {
	const { t } = useTranslation()
	return <div>{t('marketing.tos')}</div>
}
