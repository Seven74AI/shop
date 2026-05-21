import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { invariantResponse } from '@epic-web/invariant'
import { Form, Link, redirect } from 'react-router'
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { ReturnRequestSchema } from '#app/schemas/return-request.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { createReturnRequest } from '#app/utils/return-queries.server.ts'
import { getOrderById } from '#app/utils/order-queries.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/returns.new.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'New Return',
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const orderId = url.searchParams.get('orderId')

	if (!orderId) {
		throw redirect('/account/orders')
	}

	const order = await getOrderById(orderId)
	invariantResponse(order, 'Order not found', { status: 404 })
	invariantResponse(order.userId === userId, 'Unauthorized', { status: 403 })

	return { order }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: ReturnRequestSchema,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { orderId, reason, customerNotes, items } = submission.value

	// Verify the order belongs to this user
	const order = await getOrderById(orderId)
	invariantResponse(order, 'Order not found', { status: 404 })
	invariantResponse(order.userId === userId, 'Unauthorized', { status: 403 })

	// Verify all selected items belong to the order
	const orderItemIds = new Set(order.items.map((item) => item.id))
	for (const item of items) {
		invariantResponse(
			orderItemIds.has(item.orderItemId),
			`Item ${item.orderItemId} does not belong to this order`,
			{ status: 400 },
		)

		// Validate return quantity does not exceed purchased quantity
		const orderItem = order.items.find(oi => oi.id === item.orderItemId)
		invariantResponse(
			orderItem && item.quantity <= orderItem.quantity,
			`Return quantity ${item.quantity} exceeds purchased quantity ${orderItem?.quantity} for item ${item.orderItemId}`,
			{ status: 400 },
		)
	}

	const returnRequest = await createReturnRequest({
		orderId,
		reason,
		customerNotes,
		items,
	})

	return redirectWithToast(`/account/returns/${returnRequest.id}`, {
		type: 'success',
		title: 'Return Request Submitted',
		description: 'Your return request has been submitted and is pending review.',
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Request Return | Account | Epic Shop' },
]

export default function NewReturn({ loaderData, actionData }: Route.ComponentProps) {
	const { order } = loaderData
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'new-return-form',
		constraint: getZodConstraint(ReturnRequestSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ReturnRequestSchema })
		},
		defaultValue: {
			orderId: order.id,
			reason: '',
			customerNotes: '',
			items: '[]',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Request a Return</h1>
					<p className="text-gray-600">
						For order{' '}
						<Link
							to={`/account/orders/${order.orderNumber}`}
							className="font-semibold text-primary hover:underline"
						>
							{order.orderNumber}
						</Link>
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to={`/account/orders/${order.orderNumber}`}>
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Order
					</Link>
				</Button>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-blue-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
							<Icon name="package" className="w-5 h-5 text-blue-700" />
						</div>
						<CardTitle className="text-lg">Return Details</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<Form method="POST" {...getFormProps(form)} className="space-y-6">
						{/* Hidden: orderId */}
						<input {...getInputProps(fields.orderId, { type: 'hidden' })} />

						{/* Items Selection */}
						<div className="space-y-4">
							<h3 className="text-sm font-medium text-gray-700">Select Items to Return</h3>
							{order.items.map((orderItem) => (
								<div key={orderItem.id} className="flex items-center gap-4 p-4 border rounded-lg">
									{orderItem.product.images[0] && (
										<img
											src={`/resources/images?objectKey=${encodeURIComponent(orderItem.product.images[0].objectKey)}`}
											alt={orderItem.product.images[0].altText || orderItem.product.name}
											className="w-16 h-16 object-cover rounded"
										/>
									)}
									<div className="flex-1">
										<h4 className="font-semibold">{orderItem.product.name}</h4>
										{orderItem.variant && (
											<p className="text-sm text-gray-500">
												{orderItem.variant.attributeValues
													.map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
													.join(', ')}
											</p>
										)}
										<p className="text-sm text-gray-500">Purchased quantity: {orderItem.quantity}</p>
										<div className="mt-2 flex items-center gap-3">
											<label className="text-sm">
												<input
													type="checkbox"
													className="mr-1 return-item-checkbox"
													data-order-item-id={orderItem.id}
													data-product-name={orderItem.product.name}
												/>
												Select for return
											</label>
											<input
												type="number"
												className="w-20 px-2 py-1 border rounded text-sm return-item-qty"
												data-order-item-id={orderItem.id}
												placeholder="Qty"
												min="1"
												max={orderItem.quantity}
												defaultValue="1"
												disabled
											/>
										</div>
									</div>
								</div>
							))}
						</div>

						{/* Hidden: items JSON */}
						<input {...getInputProps(fields.items, { type: 'hidden' })} id={fields.items.id} />

						{/* Reason */}
						<TextareaField
							labelProps={{
								htmlFor: fields.reason.id,
								children: 'Reason for Return',
							}}
							textareaProps={{
								...getInputProps(fields.reason, { type: 'text' }),
								rows: 3,
								placeholder: 'e.g., Item arrived damaged, wrong size, changed mind...',
							}}
							errors={fields.reason.errors}
						/>

						{/* Customer Notes (optional) */}
						<TextareaField
							labelProps={{
								htmlFor: fields.customerNotes.id,
								children: 'Additional Notes (optional)',
							}}
							textareaProps={{
								...getInputProps(fields.customerNotes, { type: 'text' }),
								rows: 2,
								placeholder: 'Any additional details about your return...',
							}}
							errors={fields.customerNotes.errors}
						/>

						<ErrorList errors={form.errors} id={form.errorId} />

						{fields.items.errors && (
							<p className="text-sm text-destructive">
								Please select at least one item to return.
							</p>
						)}

						<div className="flex gap-4 justify-end pt-6 border-t">
							<Button variant="outline" asChild type="button">
								<Link to={`/account/orders/${order.orderNumber}`}>Cancel</Link>
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending ? (
									<>
										<Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
										Submitting...
									</>
								) : (
									<>
										<Icon name="check" className="h-4 w-4 mr-2" />
										Submit Return Request
									</>
								)}
							</Button>
						</div>
					</Form>

					{/* Client-side item selection logic */}
					<script
						dangerouslySetInnerHTML={{
							__html: `
								(function() {
									const checkboxes = document.querySelectorAll('.return-item-checkbox');
									const qtyInputs = document.querySelectorAll('.return-item-qty');
									const itemsField = document.getElementById('${fields.items.id}');

									function updateItemsField() {
										const items = [];
										checkboxes.forEach((cb) => {
											if (cb.checked) {
												const orderItemId = cb.dataset.orderItemId;
												const qtyInput = document.querySelector('.return-item-qty[data-order-item-id="' + orderItemId + '"]');
												items.push({
													orderItemId: orderItemId,
													quantity: parseInt(qtyInput?.value || '1', 10),
												});
											}
										});
										itemsField.value = JSON.stringify(items);
									}

									checkboxes.forEach((cb) => {
										cb.addEventListener('change', () => {
											const qtyInput = document.querySelector('.return-item-qty[data-order-item-id="' + cb.dataset.orderItemId + '"]');
											if (qtyInput) {
												qtyInput.disabled = !cb.checked;
											}
											updateItemsField();
										});
									});

									qtyInputs.forEach((input) => {
										input.addEventListener('input', updateItemsField);
									});

									// Initialize items field
									updateItemsField();
								})();
							`,
						}}
					/>
				</CardContent>
			</Card>
		</div>
	)
}
