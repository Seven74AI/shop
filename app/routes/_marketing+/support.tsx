import { Link } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'

export default function SupportRoute() {
	const { t } = useTranslation()
	return (
		<div>
			<p>{t('marketing.support')}</p>
			<p>
				<Link to="/mentions-legales">{t('marketing.mentionsLegales.title')}</Link>
			</p>
		</div>
	)
}
