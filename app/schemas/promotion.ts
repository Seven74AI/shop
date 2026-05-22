import { z } from 'zod'

/**
 * Schema for creating/editing a promotion.
 * discountValue is in basis points for PERCENTAGE (1000 = 10.00%) or cents for FIXED_AMOUNT.
 */
export const PromotionSchema = z.object({
  id: z.string().optional(),
  name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Name is required' : 'Name must be a string',
    })
    .min(1, { error: 'Name is required' })
    .max(100, { error: 'Name must be less than 100 characters' }),
  description: z
    .string()
    .max(500, { error: 'Description must be less than 500 characters' })
    .optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    error: 'Discount type must be PERCENTAGE or FIXED_AMOUNT',
  }),
  discountValue: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 0
      const num = Number(val)
      return isNaN(num) ? 0 : num
    },
    z.number().int().min(1, { error: 'Discount value must be at least 1' }),
  ),
  startsAt: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return undefined
      const d = new Date(val)
      return isNaN(d.getTime()) ? undefined : d
    }),
  expiresAt: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return undefined
      const d = new Date(val)
      return isNaN(d.getTime()) ? undefined : d
    }),
  isActive: z.preprocess(
    (val) => val === 'on' || val === true || val === 'true',
    z.boolean().default(true),
  ),
})
