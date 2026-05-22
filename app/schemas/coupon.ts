import { z } from 'zod'

export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const

/**
 * Schema for creating/editing a coupon.
 * discountValue is in basis points for PERCENTAGE (1000 = 10.00%) or cents for FIXED_AMOUNT.
 */
export const CouponSchema = z.object({
  id: z.string().optional(),
  code: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Code is required' : 'Code must be a string',
    })
    .min(1, { error: 'Code is required' })
    .max(50, { error: 'Code must be less than 50 characters' })
    .regex(/^[A-Z0-9_-]+$/, {
      error: 'Code can only contain uppercase letters, numbers, underscores, and hyphens',
    }),
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
  minOrderAmount: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined
      const num = Number(val)
      return isNaN(num) ? undefined : num
    },
    z.number().int().min(0).optional(),
  ),
  maxUses: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined
      const num = Number(val)
      return isNaN(num) ? undefined : num
    },
    z.number().int().min(1, { error: 'Max uses must be at least 1' }).optional(),
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

/**
 * Generates a random coupon code (uppercase alphanumeric, 8 characters).
 */
export function generateCouponCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
