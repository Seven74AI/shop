import { Outlet } from 'react-router'
import { type BreadcrumbHandle } from '../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Returns',
}

export default function ReturnsLayout() {
	return <Outlet />
}
