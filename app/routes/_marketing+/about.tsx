import { useTranslation } from '#app/utils/i18n.tsx'

export default function AboutRoute() {
	const { t } = useTranslation()
	return <div>{t('marketing.about')}</div>
}
