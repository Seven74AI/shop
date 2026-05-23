import { useTranslation } from '#app/utils/i18n.tsx'

export default function MentionsLegalesRoute() {
	const { t } = useTranslation()
	return <div>{t('marketing.mentionsLegales')}</div>
}
