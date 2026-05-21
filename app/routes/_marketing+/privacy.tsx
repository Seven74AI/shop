import { useTranslation } from '#app/utils/i18n.tsx'

export default function PrivacyRoute() {
	const { t } = useTranslation()
	return <div>{t('marketing.privacy')}</div>
}
