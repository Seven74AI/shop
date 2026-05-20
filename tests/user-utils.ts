import { faker } from '@faker-js/faker'
import { getPasswordHash } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { twoFAVerificationType } from '#app/routes/account+/security+/two-factor.tsx'
import { createUser } from '#tests/db-utils.ts'

export type UserData = ReturnType<typeof createUser>

/**
 * Creates an admin user in the database with 2FA pre-enrolled.
 * Admin users MUST have 2FA set up to access any admin routes.
 */
export async function createAdminUser() {
	const userData = createUser()
	const password = faker.internet.password({ length: 12 })
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username: userData.username,
			email: userData.email,
			name: userData.name,
			roles: { connect: { name: 'admin' } },
			password: {
				create: {
					hash: hashedPassword,
				},
			},
		},
		select: { id: true, email: true, username: true, name: true },
	})

	// Admin users must have 2FA enrolled to access admin routes
	const { otp: _otp, ...totpConfig } = await generateTOTP()
	await prisma.verification.create({
		data: {
			type: twoFAVerificationType,
			target: user.id,
			...totpConfig,
		},
	})

	return { user, password }
}

/**
 * Creates a test user in the database
 */
export async function createTestUser(overrides?: Partial<UserData>) {
	const userData = createUser()
	const password = faker.internet.password({ length: 12 })
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username: overrides?.username ?? userData.username,
			email: overrides?.email ?? userData.email,
			name: overrides?.name ?? userData.name,
			password: {
				create: {
					hash: hashedPassword,
				},
			},
		},
		select: { id: true, email: true, username: true, name: true },
	})

	return { user, password }
}

/**
 * Creates a test user with specific roles
 */
export async function createTestUserWithRoles(roleNames: string[], overrides?: Partial<UserData>) {
	const userData = createUser()
	const password = faker.internet.password({ length: 12 })
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username: overrides?.username ?? userData.username,
			email: overrides?.email ?? userData.email,
			name: overrides?.name ?? userData.name,
			roles: {
				connect: roleNames.map((name) => ({ name })),
			},
			password: {
				create: {
					hash: hashedPassword,
				},
			},
		},
		select: { id: true, email: true, username: true, name: true },
	})

	return { user, password }
}

/**
 * Creates a test role in the database
 */
export async function createTestRole(overrides?: { name?: string; description?: string }) {
	const name = overrides?.name ?? `role_${faker.string.alphanumeric({ length: 8 }).toLowerCase()}`
	const description = overrides?.description ?? faker.lorem.sentence()

	return await prisma.role.create({
		data: {
			name,
			description,
		},
	})
}
