import { useForm, getFormProps, getInputProps, FormProvider, getCollectionProps } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, data } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { auditLog } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { handlePrismaError } from '#app/utils/prisma-error.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { EmailSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/$userId_.edit.ts'

const UserEditSchema = z.object({
	id: z.string({
		error: (issue) =>
			issue.input === undefined ? 'ID is required' : 'Not a string',
	}),
	name: z
		.string()
		.transform((val) => (val && val.trim() ? val.trim() : null))
		.refine(
			(val) => {
				// Allow null (empty), or validate length if string
				if (val === null) return true
				return val.length >= 3 && val.length <= 40
			},
			{
				message: 'Name must be between 3 and 40 characters, or empty',
			},
		),
	email: EmailSchema,
	username: UsernameSchema,
	roleIds: z.preprocess(
		(val) => {
			// Handle FormData - unchecked checkboxes won't be in FormData at all
			// parseFormData will convert FormData.getAll() to array, or undefined if missing
			if (val === undefined || val === null) return []
			if (Array.isArray(val)) return val.filter(Boolean) // Filter out empty strings
			if (typeof val === 'string' && val) return [val]
			return []
		},
		z.array(z.string()),
	),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			roles: {
				select: {
					id: true,
					name: true,
					description: true,
				},
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	// Get all available roles for the role selection
	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
			description: true,
		},
		orderBy: { name: 'asc' },
	})

	return { user, roles }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
	const adminUserId = await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	
	const submission = await parseWithZod(formData, {
		schema: UserEditSchema.superRefine(async (data, ctx) => {
			// Check email uniqueness (excluding current user)
			const existingEmail = await prisma.user.findFirst({
				where: {
					email: data.email,
					id: { not: data.id },
				},
			})
			if (existingEmail) {
				ctx.addIssue({
					code: 'custom',
					message: 'A user already exists with this email',
					path: ['email'],
				})
			}

			// Check username uniqueness (excluding current user)
			const existingUsername = await prisma.user.findFirst({
				where: {
					username: data.username,
					id: { not: data.id },
				},
			})
			if (existingUsername) {
				ctx.addIssue({
					code: 'custom',
					message: 'A user already exists with this username',
					path: ['username'],
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id, name, email, username, roleIds } = submission.value

	try {
		// Load current roles for diff
		const currentUser = await prisma.user.findUnique({
			where: { id },
			include: { roles: { select: { id: true, name: true } } },
		})
		const oldRoleNames = currentUser?.roles.map(r => r.name) ?? []

		await prisma.$transaction(async (tx) => {
			// Update user fields and roles
			await tx.user.update({
				where: { id },
				data: {
					name: name || null,
					email,
					username,
					roles: {
						set: [], // Clear existing roles
						connect: roleIds.map((roleId) => ({ id: roleId })), // Connect new roles
					},
				},
			})
		})

		// Audit log for role changes
		const newRoles = await prisma.role.findMany({
			where: { id: { in: roleIds } },
			select: { name: true },
		})
		const newRoleNames = newRoles.map(r => r.name)
		await auditLog(adminUserId, 'UPDATE', 'User', id, {
			name: { before: currentUser?.name, after: name },
			email: { before: currentUser?.email, after: email },
			roles: { before: oldRoleNames, after: newRoleNames },
		}, request)

		return redirectWithToast(`/admin/users/${id}`, {
			type: 'success',
			title: 'User Updated',
			description: `User "${name || username}" updated successfully`,
		})
	} catch (error) {
		return handlePrismaError(error)
	}
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.user) {
		return [{ title: 'User Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `Edit ${loaderData.user.name || loaderData.user.username} | Admin | Epic Shop`,
		},
		{
			name: 'description',
			content: `Edit user: ${loaderData.user.email}`,
		},
	]
}


function RoleCheckbox({
	role,
	checkboxProps,
}: {
	role: { id: string; name: string; description: string | null }
	checkboxProps: {
		id: string
		name: string
		value: string
		defaultChecked?: boolean
	}
}) {
	return (
		<div className="flex items-center space-x-2">
			<input
				type="checkbox"
				{...checkboxProps}
				defaultChecked={checkboxProps.defaultChecked ?? false}
				className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
			/>
			<Label
				htmlFor={checkboxProps.id}
				className="text-sm font-normal cursor-pointer"
			>
				{role.name}
				{role.description && (
					<span className="ml-2 text-xs text-muted-foreground">
						({role.description})
					</span>
				)}
			</Label>
		</div>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$userId_.edit.lazy')
