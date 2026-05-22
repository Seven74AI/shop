import { Outlet } from 'react-router'
import { type BreadcrumbHandle } from '../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Invoices',
}

export default function InvoicesLayout() {
	return <Outlet />
}

export async function loader() {
	return {}
}
