import { z } from 'zod'

/**
 * Schema for the return request form
 */
export const ReturnRequestSchema = z.object({
	orderId: z.string().min(1, { error: 'Order is required' }),
	reason: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({ error: 'Reason is required' })
			.min(1, { error: 'Reason is required' })
			.max(1000, { error: 'Reason must be less than 1000 characters' })
			.trim(),
	),
	customerNotes: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string()
			.max(2000, { error: 'Notes must be less than 2000 characters' })
			.trim()
			.optional(),
	),
	// Items to return: JSON string of { orderItemId: string, quantity: number, reasonItem?: string }[]
	items: z.preprocess(
		(val) => {
			if (typeof val === 'string') {
				try {
					return JSON.parse(val)
				} catch {
					return undefined
				}
			}
			return val
		},
		z
			.array(
				z.object({
					orderItemId: z.string().min(1),
					quantity: z.number().int().min(1, { error: 'Quantity must be at least 1' }),
					reasonItem: z
						.string()
						.max(500)
						.optional(),
				}),
			)
			.min(1, { error: 'At least one item must be selected for return' }),
	),
})

export type ReturnRequestFormData = z.infer<typeof ReturnRequestSchema>
