import { useTranslation } from '#app/utils/i18n.tsx'
import { Badge } from '#app/components/ui/badge.tsx'

/**
 * Product status badge component
 * 
 * @param status - Product status (ACTIVE, ARCHIVED, DRAFT)
 * @returns Badge component with appropriate styling based on status
 */
export function ProductStatusBadge({ status }: { status: string }) {
	const { t } = useTranslation()
	if (status === 'ACTIVE') {
		return <Badge variant="success">{t('product.status.active')}</Badge>
	}
	if (status === 'ARCHIVED') {
		return <Badge variant="destructive">{t('product.status.archived')}</Badge>
	}
	return <Badge variant="secondary">{t('product.status.draft')}</Badge>
}

/**
 * Stock status badge component
 * 
 * @param stockQuantity - Current stock quantity
 * @returns Badge component with stock status (Out of Stock, Low Stock, In Stock)
 */
export function StockBadge({ stockQuantity }: { stockQuantity: number }) {
	const { t } = useTranslation()
	if (stockQuantity === 0) {
		return <Badge variant="destructive">{t('product.outOfStock')}</Badge>
	}
	if (stockQuantity <= 10) {
		return <Badge variant="warning">{t('product.status.lowStock', { count: String(stockQuantity) })}</Badge>
	}
	return <Badge variant="success">{t('product.status.inStock', { count: String(stockQuantity) })}</Badge>
}
