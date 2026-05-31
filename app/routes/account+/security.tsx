import { Outlet } from 'react-router'
import { type BreadcrumbHandle } from '../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Security', // dynamic: resolved to t('account.breadcrumb.security') in breadcrumb
}

export default function SecurityLayout() {
	return <Outlet />
}

