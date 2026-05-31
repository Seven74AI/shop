import { Link, useFetcher } from 'react-router'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { type Route } from './+types/addresses.index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const addresses = await prisma.address.findMany({
		where: { userId },
		orderBy: [
			{ isDefaultShipping: 'desc' },
			{ isDefaultBilling: 'desc' },
			{ createdAt: 'desc' },
		],
	})

	return { addresses }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'set-default-shipping') {
		const addressId = formData.get('addressId')
		if (typeof addressId !== 'string') {
			return redirectWithToast('/account/addresses', {
				type: 'error',
				title: 'Error',
				description: 'Invalid address ID',
			})
		}

		// Unset all other default shipping addresses
		await prisma.address.updateMany({
			where: {
				userId,
				isDefaultShipping: true,
			},
			data: {
				isDefaultShipping: false,
			},
		})

		// Set this address as default
		await prisma.address.update({
			where: {
				id: addressId,
				userId, // Ensure user owns this address
			},
			data: {
				isDefaultShipping: true,
			},
		})

		return redirectWithToast('/account/addresses', {
			type: 'success',
			title: 'Default Updated',
			description: 'Default shipping address updated',
		})
	}

	if (intent === 'set-default-billing') {
		const addressId = formData.get('addressId')
		if (typeof addressId !== 'string') {
			return redirectWithToast('/account/addresses', {
				type: 'error',
				title: 'Error',
				description: 'Invalid address ID',
			})
		}

		// Unset all other default billing addresses
		await prisma.address.updateMany({
			where: {
				userId,
				isDefaultBilling: true,
			},
			data: {
				isDefaultBilling: false,
			},
		})

		// Set this address as default
		await prisma.address.update({
			where: {
				id: addressId,
				userId, // Ensure user owns this address
			},
			data: {
				isDefaultBilling: true,
			},
		})

		return redirectWithToast('/account/addresses', {
			type: 'success',
			title: 'Default Updated',
			description: 'Default billing address updated',
		})
	}

	if (intent === 'delete') {
		const addressId = formData.get('addressId')
		if (typeof addressId !== 'string') {
			return redirectWithToast('/account/addresses', {
				type: 'error',
				title: 'Error',
				description: 'Invalid address ID',
			})
		}

		await prisma.address.delete({
			where: {
				id: addressId,
				userId, // Ensure user owns this address
			},
		})

		return redirectWithToast('/account/addresses', {
			type: 'success',
			title: 'Address Deleted',
			description: 'Address has been deleted',
		})
	}

	return redirectWithToast('/account/addresses', {
		type: 'error',
		title: 'Error',
		description: 'Invalid action',
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Addresses | Settings | Epic Shop' },
	{ name: 'description', content: 'Manage your saved addresses' },
]

function AddressCard({ address }: { address: Route.ComponentProps['loaderData']['addresses'][number] }) {
	const fetcher = useFetcher()

	const getTypeBadgeVariant = (type: string) => {
		switch (type) {
			case 'SHIPPING':
				return 'default'
			case 'BILLING':
				return 'secondary'
			case 'BOTH':
				return 'outline'
			default:
				return 'default'
		}
	}

	const { t: _t } = useTranslation()
	const getTypeLabel = (type: string) => {
		switch (type) {
			case 'SHIPPING':
				return _t('account.addresses.type.shipping')
			case 'BILLING':
				return _t('account.addresses.type.billing')
			case 'BOTH':
				return _t('account.addresses.type.both')
			default:
				return type
		}
	}

	return (
		<Card className="p-6 hover:shadow-lg transition-shadow border-blue-100 bg-white/80 backdrop-blur-sm">
			<CardHeader className="p-0 pb-4">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<div className="flex items-center gap-2 mb-2">
							<CardTitle className="text-lg">
								{address.label || 'Address'}
							</CardTitle>
							<Badge variant={getTypeBadgeVariant(address.type)}>
								{getTypeLabel(address.type)}
							</Badge>
							{address.isDefaultShipping && (
								<Badge variant="success">{_t('account.addresses.defaultShipping')}</Badge>
							)}
							{address.isDefaultBilling && (
								<Badge variant="success">{_t('account.addresses.defaultBilling')}</Badge>
							)}
						</div>
						<div className="text-sm text-gray-500 space-y-1">
							<p className="text-gray-900">{address.name}</p>
							<p>{address.street}</p>
							<p>
								{address.city}
								{address.state && `, ${address.state}`} {address.postal}
							</p>
							<p>{address.country}</p>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" asChild>
						<Link to={`${address.id}/edit`}>
							<Icon name="pencil-1" className="h-4 w-4 mr-2" />
							{_t('account.addresses.edit')}
						</Link>
					</Button>
					{!address.isDefaultShipping && (
						<fetcher.Form method="POST">
							<input type="hidden" name="intent" value="set-default-shipping" />
							<input type="hidden" name="addressId" value={address.id} />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={fetcher.state !== 'idle'}
							>
								<Icon name="check" className="h-4 w-4 mr-2" />
								{_t('account.addresses.setDefaultShipping')}
							</Button>
						</fetcher.Form>
					)}
					{!address.isDefaultBilling && (
						<fetcher.Form method="POST">
							<input type="hidden" name="intent" value="set-default-billing" />
							<input type="hidden" name="addressId" value={address.id} />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={fetcher.state !== 'idle'}
							>
								<Icon name="check" className="h-4 w-4 mr-2" />
								{_t('account.addresses.setDefaultBilling')}
							</Button>
						</fetcher.Form>
					)}
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="text-destructive hover:text-destructive"
							>
								<Icon name="trash" className="h-4 w-4 mr-2" />
								{_t('account.addresses.delete')}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{_t('account.addresses.deleteTitle')}</AlertDialogTitle>
								<AlertDialogDescription>
									{_t('account.addresses.deleteDescription')}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{_t('admin.flags.cancel')}</AlertDialogCancel>
								<fetcher.Form method="POST">
									<input type="hidden" name="intent" value="delete" />
									<input type="hidden" name="addressId" value={address.id} />
									<AlertDialogAction
										type="submit"
										disabled={fetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{fetcher.state !== 'idle' ? _t('account.addresses.deleting') : _t('account.addresses.delete')}
									</AlertDialogAction>
								</fetcher.Form>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</CardContent>
		</Card>
	)
}

export default function Addresses({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const { addresses } = loaderData

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('account.addresses.title')}</h1>
					<p className="text-gray-600">
						{t('account.addresses.description')}
					</p>
				</div>
				<Button asChild>
					<Link to="new">
						<Icon name="plus" className="h-4 w-4 mr-2" />
						{t('account.addresses.addNew')}
					</Link>
				</Button>
			</div>

			{addresses.length === 0 ? (
				<Card className="p-6 hover:shadow-lg transition-shadow border-blue-100 bg-white/80 backdrop-blur-sm">
					<CardContent className="py-12 text-center">
						<Icon name="map-pin" className="h-12 w-12 mx-auto mb-4 text-gray-500" />
						<p className="text-lg text-gray-900 mb-2">{t('account.addresses.empty')}</p>
						<p className="text-sm text-gray-500 mb-4">
							{t('account.addresses.emptyDescription')}
						</p>
						<Button asChild>
							<Link to="new">
								<Icon name="plus" className="h-4 w-4 mr-2" />
								{t('account.addresses.addFirst')}
							</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-6 md:grid-cols-2">
					{addresses.map((address) => (
						<AddressCard key={address.id} address={address} />
					))}
				</div>
			)}
		</div>
	)
}

