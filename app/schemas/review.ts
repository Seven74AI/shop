import { z } from 'zod'

/** Maximum length for review title */
export const MAX_REVIEW_TITLE_LENGTH = 200
/** Minimum length for review title */
export const MIN_REVIEW_TITLE_LENGTH = 5
/** Maximum length for review body */
export const MAX_REVIEW_BODY_LENGTH = 5000
/** Minimum length for review body */
export const MIN_REVIEW_BODY_LENGTH = 20
/** Valid rating values */
export const VALID_RATINGS = [1, 2, 3, 4, 5] as const

/**
 * Schema for validating review submission data.
 *
 * @description Validates rating (1-5), title (5-200 chars),
 * body (20-5000 chars), and optional orderId for verified purchase checks.
 */
export const ReviewSubmissionSchema = z.object({
  rating: z
    .number({
      error: (issue) =>
        issue.input === undefined
          ? 'Rating is required'
          : 'Rating must be a number',
    })
    .int({ error: 'Rating must be a whole number' })
    .min(1, { error: 'Rating must be at least 1' })
    .max(5, { error: 'Rating must be at most 5' }),
  title: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Title is required'
          : 'Title must be a string',
    })
    .min(MIN_REVIEW_TITLE_LENGTH, {
      error: `Title must be at least ${MIN_REVIEW_TITLE_LENGTH} characters`,
    })
    .max(MAX_REVIEW_TITLE_LENGTH, {
      error: `Title must be less than ${MAX_REVIEW_TITLE_LENGTH} characters`,
    }),
  body: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Review body is required'
          : 'Review body must be a string',
    })
    .min(MIN_REVIEW_BODY_LENGTH, {
      error: `Review must be at least ${MIN_REVIEW_BODY_LENGTH} characters`,
    })
    .max(MAX_REVIEW_BODY_LENGTH, {
      error: `Review must be less than ${MAX_REVIEW_BODY_LENGTH} characters`,
    }),
  orderId: z.string().optional(),
})

/**
 * Type inference for review submission from schema
 */
export type ReviewSubmission = z.infer<typeof ReviewSubmissionSchema>
