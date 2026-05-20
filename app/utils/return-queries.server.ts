import { prisma } from './db.server.ts'

const returnRequestInclude = {
	include: {
		order: {
			select: {
				id: true,
				orderNumber: true,
				total: true,
				status: true,
				userId: true,
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
							select: {
								id: true,
								attributeValues: {
									select: {
										attributeValue: {
											select: {
												value: true,
												attribute: {
													select: {
														name: true,
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
			},
		},
	},
} as const

export async function getReturnRequestById(returnId: string) {
	return prisma.returnRequest.findUnique({
		where: { id: returnId },
		...returnRequestInclude,
	})
}

export async function getReturnRequestsByUserId(userId: string) {
	return prisma.returnRequest.findMany({
		where: {
			order: {
				userId,
			},
		},
		orderBy: { createdAt: 'desc' },
		...returnRequestInclude,
	})
}

export async function getReturnRequestsByOrderId(orderId: string) {
	return prisma.returnRequest.findMany({
		where: { orderId },
		...returnRequestInclude,
	})
}

export async function createReturnRequest(data: {
	orderId: string
	reason: string
	customerNotes?: string
	items: Array<{ orderItemId: string; quantity: number; reasonItem?: string }>
}) {
	return prisma.returnRequest.create({
		data: {
			orderId: data.orderId,
			reason: data.reason,
			customerNotes: data.customerNotes,
			status: 'REQUESTED',
			items: {
				create: data.items.map((item) => ({
					orderItemId: item.orderItemId,
					quantity: item.quantity,
					reasonItem: item.reasonItem,
				})),
			},
		},
		...returnRequestInclude,
	})
}
