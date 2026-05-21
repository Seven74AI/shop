import { useTranslation } from '#app/utils/i18n.tsx'

export default function SupportRoute() {
	const { t } = useTranslation()
	return <div>{t('marketing.support')}</div>
}
