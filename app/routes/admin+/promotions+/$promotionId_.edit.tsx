import { useForm, getFormProps, getInputProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { PromotionSchema } from '#app/schemas/promotion.ts'
import { type Route } from './+types/$promotionId_.edit.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')

  const promotion = await prisma.promotion.findUnique({
    where: { id: params.promotionId },
  })

  invariantResponse(promotion, 'Promotion not found', { status: 404 })

  return { promotion }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')

  const formData = await parseFormData(request)
  const submission = await parseWithZod(formData, {
    schema: PromotionSchema,
  })

  if (submission.status !== 'success') {
    return {
      result: submission.reply(),
    }
  }

  const { id, name, description, discountType, discountValue, startsAt, expiresAt, isActive } =
    submission.value

  if (!id) {
    return {
      result: submission.reply({
        formErrors: ['Promotion ID is required for update.'],
      }),
    }
  }

  const existingPromotion = await prisma.promotion.findUnique({
    where: { id },
  })
  invariantResponse(existingPromotion, 'Promotion not found', { status: 404 })

  const promotion = await prisma.promotion.update({
    where: { id },
    data: {
      name,
      description: description ?? null,
      discountType,
      discountValue,
      startsAt: startsAt ?? null,
      expiresAt: expiresAt ?? null,
      isActive,
    },
  })

  return redirectWithToast(`/admin/promotions`, {
    description: `Promotion "${promotion.name}" updated successfully`,
  })
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: `Edit ${loaderData?.promotion.name} | Promotions | Admin | Epic Shop`,
  },
  {
    name: 'description',
    content: `Edit promotion: ${loaderData?.promotion.name}`,
  },
]

function PromotionForm({
  promotion,
  actionData,
}: {
  promotion: Route.ComponentProps['loaderData']['promotion']
  actionData?: Route.ComponentProps['actionData']
}) {
  const isPending = useIsPending()

  const [form, fields] = useForm({
    id: 'promotion-form',
    constraint: getZodConstraint(PromotionSchema),
    lastResult: actionData?.result,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: PromotionSchema })
    },
    defaultValue: {
      id: promotion.id,
      name: promotion.name,
      description: promotion.description ?? '',
      discountType: promotion.discountType,
      discountValue: promotion.discountValue.toString(),
      startsAt: promotion.startsAt
        ? new Date(promotion.startsAt).toISOString().slice(0, 16)
        : '',
      expiresAt: promotion.expiresAt
        ? new Date(promotion.expiresAt).toISOString().slice(0, 16)
        : '',
      isActive: promotion.isActive ? 'on' : '',
    },
    shouldRevalidate: 'onBlur',
  })

  return (
    <FormProvider context={form.context}>
      <Form method="POST" className="space-y-8" {...getFormProps(form)}>
        <input {...getInputProps(fields.id, { type: 'hidden' })} />
        <Card className="rounded-[14px]">
          <CardHeader>
            <h2 className="text-base font-normal text-foreground">
              Promotion Details
            </h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor={fields.name.id} className="text-sm font-medium">
                Promotion Name *
              </Label>
              <Input
                {...getInputProps(fields.name, { type: 'text' })}
                placeholder="e.g., Summer Sale 2025"
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              />
              <ErrorList errors={fields.name.errors} />
            </div>

            <div className="space-y-3">
              <Label
                htmlFor={fields.description.id}
                className="text-sm font-medium"
              >
                Description
              </Label>
              <Textarea
                {...getInputProps(fields.description, { type: 'text' })}
                placeholder="Describe the promotion for internal reference..."
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 min-h-[80px]"
              />
              <ErrorList errors={fields.description.errors} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Label
                  htmlFor={fields.discountType.id}
                  className="text-sm font-medium"
                >
                  Discount Type *
                </Label>
                <Select
                  name={fields.discountType.name}
                  defaultValue={promotion.discountType}
                >
                  <SelectTrigger
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    aria-label="Discount type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FIXED_AMOUNT">
                      Fixed Amount (€)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <ErrorList errors={fields.discountType.errors} />
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor={fields.discountValue.id}
                  className="text-sm font-medium"
                >
                  Discount Value *
                </Label>
                <Input
                  {...getInputProps(fields.discountValue, {
                    type: 'number',
                  })}
                  placeholder="1000 = 10.00% or 10.00 EUR"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground">
                  For percentage: basis points (1000 = 10.00%). For fixed
                  amount: cents (1000 = 10.00 EUR).
                </p>
                <ErrorList errors={fields.discountValue.errors} />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Label
                  htmlFor={fields.startsAt.id}
                  className="text-sm font-medium"
                >
                  Start Date
                </Label>
                <Input
                  {...getInputProps(fields.startsAt, {
                    type: 'datetime-local',
                  })}
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.startsAt.errors} />
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor={fields.expiresAt.id}
                  className="text-sm font-medium"
                >
                  Expiry Date
                </Label>
                <Input
                  {...getInputProps(fields.expiresAt, {
                    type: 'datetime-local',
                  })}
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.expiresAt.errors} />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                {...getInputProps(fields.isActive, { type: 'checkbox' })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                defaultChecked={promotion.isActive}
              />
              <Label
                htmlFor={fields.isActive.id}
                className="text-sm font-medium cursor-pointer"
              >
                Active (promotion is live)
              </Label>
            </div>
            <ErrorList errors={fields.isActive.errors} />
            {form.errors && <ErrorList errors={form.errors} />}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            asChild
            className="transition-all duration-200 hover:shadow-sm"
          >
            <Link to="/admin/promotions">Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            className="transition-all duration-200 hover:shadow-md"
          >
            {isPending ? 'Updating...' : 'Update Promotion'}
          </Button>
        </div>
      </Form>
    </FormProvider>
  )
}

export default function EditPromotion({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { promotion } = loaderData

  return (
    <div className="space-y-8 animate-slide-top">
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-foreground">
          Edit Promotion
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update promotion{' '}
          <span className="font-medium">{promotion.name}</span>
        </p>
      </div>

      <PromotionForm promotion={promotion} actionData={actionData} />
    </div>
  )
}
