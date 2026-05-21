import { prisma } from './db.server.ts'

const returnOrderUserSelect = {
	select: {
		id: true,
		email: true,
		username: true,
		name: true,
	},
} as const

export async function getReturnRequestById(returnId: string) {
	return prisma.returnRequest.findUnique({
		where: { id: returnId },
		include: {
			order: {
				include: {
					user: returnOrderUserSelect,
				},
			},
			items: {
				include: {
					orderItem: {
						include: {
							product: {
								select: {
									id: true,
									name: true,
									slug: true,
									images: {
										select: {
											objectKey: true,
											altText: true,
										},
										orderBy: { displayOrder: 'asc' },
										take: 1,
									},
								},
							},
							variant: {
								include: {
									attributeValues: {
										include: {
											attributeValue: {
												include: { attribute: true },
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

export async function getAllReturnRequests() {
	return prisma.returnRequest.findMany({
		include: {
			order: {
				select: {
					orderNumber: true,
					email: true,
					id: true,
				},
			},
			items: {
				select: {
					id: true,
					quantity: true,
				},
			},
		},
		orderBy: { requestedAt: 'desc' },
	})
}
