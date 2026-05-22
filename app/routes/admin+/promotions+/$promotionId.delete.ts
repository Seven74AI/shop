import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$promotionId.delete.ts'

const DeletePromotionSchema = z.object({
  promotionId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')

  const formData = await request.formData()
  const submission = parseWithZod(formData, { schema: DeletePromotionSchema })

  if (submission.status !== 'success') {
    return data({ result: submission.reply() }, { status: 400 })
  }

  const promotion = await prisma.promotion.findUnique({
    where: { id: params.promotionId },
  })

  invariantResponse(promotion, 'Promotion not found', { status: 404 })

  await prisma.promotion.delete({ where: { id: promotion.id } })

  return redirectWithToast('/admin/promotions', {
    description: `Promotion "${promotion.name}" deleted.`,
  })
}
