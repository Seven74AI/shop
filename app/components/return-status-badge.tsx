import { Badge } from '#app/components/ui/badge.tsx'
import {
	getReturnStatusBadgeVariant,
	getReturnStatusLabel,
} from '#app/utils/return-status.ts'

/**
 * Return status badge component
 *
 * @param status - Return status (REQUESTED, APPROVED, RECEIVED, REFUNDED, REJECTED)
 * @param className - Optional additional CSS classes
 */
export function ReturnStatusBadge({
	status,
	className,
}: {
	status: string
	className?: string
}) {
	return (
		<Badge
			variant={getReturnStatusBadgeVariant(status)}
			className={className}
		>
			{getReturnStatusLabel(status)}
		</Badge>
	)
}
