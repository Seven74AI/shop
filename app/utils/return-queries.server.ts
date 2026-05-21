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

export async function getReturnRequestsByUserId(userId: string) {
	return prisma.returnRequest.findMany({
		where: { order: { userId } },
		include: {
			order: {
				select: {
					orderNumber: true,
					email: true,
					id: true,
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
		orderBy: { requestedAt: 'desc' },
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

export async function createReturnRequest({
	orderId,
	reason,
	customerNotes,
	items,
}: {
	orderId: string
	reason: string
	customerNotes?: string
	items: { orderItemId: string; quantity: number; reasonItem?: string }[]
}) {
	return prisma.$transaction(async (tx) => {
		const returnRequest = await tx.returnRequest.create({
			data: {
				orderId,
				reason,
				customerNotes,
				status: 'REQUESTED',
				items: {
					create: items.map((item) => ({
						orderItemId: item.orderItemId,
						quantity: item.quantity,
						reasonItem: item.reasonItem,
					})),
				},
			},
			include: {
				items: {
					include: {
						orderItem: {
							include: {
								product: {
									select: {
										id: true,
										name: true,
										slug: true,
									},
								},
							},
						},
					},
				},
			},
		})

		return returnRequest
	})
}
