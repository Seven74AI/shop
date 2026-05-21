import { z } from 'zod'

/**
 * Schema for a feature flag audience filter (JSON).
 * Stored as a JSON string in the database, validated on read/write.
 */
export const FlagAudienceSchema = z.object({
	userIds: z.array(z.string()).optional(),
	countries: z.array(z.string()).optional(),
	roles: z.array(z.string()).optional(),
})

export type FlagAudience = z.infer<typeof FlagAudienceSchema>

/**
 * Schema for validating feature flag data (used in admin UI forms).
 */
export const FlagSchema = z.object({
	key: z
		.string({
			error: (issue) =>
				issue.input === undefined ? 'Key is required' : 'Key must be a string',
		})
		.min(1, { error: 'Key is required' })
		.max(100, { error: 'Key must be less than 100 characters' })
		.regex(/^[a-zA-Z0-9_-]+$/, {
			error:
				'Key can only contain letters, numbers, underscores, and hyphens',
		}),
	enabled: z.preprocess(
		(val) => val === 'true' || val === 'on' || val === true,
		z.boolean(),
	),
	rolloutPercentage: z.preprocess(
		(val) => {
			if (val === '' || val === undefined || val === null) return 0
			return Number(val)
		},
		z.number().int().min(0).max(100),
	),
	audience: z.string().optional(),
	description: z
		.string()
		.max(500, { error: 'Description must be less than 500 characters' })
		.optional(),
})
