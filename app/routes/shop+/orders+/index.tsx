import { redirect } from 'react-router'
import { getUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/index.ts'
import * as guestOrderLookup from './guest-order-lookup.tsx'

export async function loader(args: Route.LoaderArgs) {
	const userId = await getUserId(args.request)
	if (userId) return redirect('/account/orders')
	return guestOrderLookup.loader(args)
}

export async function action(args: Route.ActionArgs) {
	const userId = await getUserId(args.request)
	if (userId) return redirect('/account/orders')
	return guestOrderLookup.action(args)
}

export { default, meta } from './guest-order-lookup.tsx'
