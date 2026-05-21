export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'REFUNDED' | 'REJECTED'

const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
	REQUESTED: 'Requested',
	APPROVED: 'Approved',
	RECEIVED: 'Received',
	REFUNDED: 'Refunded',
	REJECTED: 'Rejected',
}

export function getReturnStatusBadgeVariant(
	status: string,
): 'warning' | 'default' | 'secondary' | 'success' | 'destructive' {
	switch (status) {
		case 'REQUESTED':
			return 'warning'
		case 'APPROVED':
			return 'default'
		case 'RECEIVED':
			return 'secondary'
		case 'REFUNDED':
			return 'success'
		case 'REJECTED':
			return 'destructive'
		default:
			return 'secondary'
	}
}

export function getReturnStatusLabel(status: string): string {
	return RETURN_STATUS_LABELS[status as ReturnStatus] || status
}