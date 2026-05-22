import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#app/components/ui/table.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')

  const coupons = await prisma.coupon.findMany({
    orderBy: [{ createdAt: 'desc' }],
  })

  return { coupons }
}

export const meta: Route.MetaFunction = () => [
  { title: 'Coupons | Admin | Epic Shop' },
  { name: 'description', content: 'Manage discount coupons' },
]

function formatDiscount(coupon: Route.ComponentProps['loaderData']['coupons'][number]): string {
  if (coupon.discountType === 'PERCENTAGE') {
    return `${(coupon.discountValue / 100).toFixed(2)}%`
  }
  return `€${(coupon.discountValue / 100).toFixed(2)}`
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function CouponRow({ coupon }: { coupon: Route.ComponentProps['loaderData']['coupons'][number] }) {
  const fetcher = useFetcher()
  const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date()
  const isMaxedOut = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses
  const isNotStarted = coupon.startsAt && new Date(coupon.startsAt) > new Date()

  return (
    <TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
      <TableCell>
        <div className="flex items-center space-x-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm font-medium bg-muted px-2 py-0.5 rounded">
                {coupon.code}
              </code>
              {!coupon.isActive && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
              {coupon.isActive && isExpired && (
                <Badge variant="destructive" className="text-xs">
                  Expired
                </Badge>
              )}
              {coupon.isActive && isMaxedOut && (
                <Badge variant="outline" className="text-xs">
                  Maxed Out
                </Badge>
              )}
              {coupon.isActive && isNotStarted && (
                <Badge variant="outline" className="text-xs">
                  Scheduled
                </Badge>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant="default" className="text-xs">
          {coupon.discountType === 'PERCENTAGE' ? '%' : '€'} {formatDiscount(coupon)}
        </Badge>
      </TableCell>
      <TableCell className="hidden lg:table-cell text-muted-foreground">
        {coupon.maxUses !== null ? (
          <span>
            {coupon.usedCount} / {coupon.maxUses}
          </span>
        ) : (
          <span>{coupon.usedCount} uses</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
        {formatDate(coupon.startsAt)}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
        {formatDate(coupon.expiresAt)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end space-x-1">
          <Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
            <Link
              to={`/admin/promotions/coupons/${coupon.id}/edit`}
              aria-label={`Edit ${coupon.code}`}
            >
              <Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive transition-colors duration-200"
                aria-label={`Delete ${coupon.code}`}
              >
                <Icon name="trash" className="h-4 w-4" aria-hidden="true" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Coupon</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete coupon "{coupon.code}"? This action cannot be
                  undone.
                  {coupon.usedCount > 0 && (
                    <span className="block mt-2 text-destructive">
                      This coupon has been used {coupon.usedCount} time
                      {coupon.usedCount === 1 ? '' : 's'}.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <fetcher.Form
                  method="POST"
                  action={`/admin/promotions/coupons/${coupon.id}/delete`}
                >
                  <input type="hidden" name="couponId" value={coupon.id} />
                  <AlertDialogAction
                    type="submit"
                    disabled={fetcher.state !== 'idle'}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
                  >
                    {fetcher.state === 'idle' ? 'Delete Coupon' : 'Deleting...'}
                  </AlertDialogAction>
                </fetcher.Form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function CouponsList({ loaderData }: Route.ComponentProps) {
  const { coupons } = loaderData
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'expired'>(
    'all',
  )

  const filteredCoupons = useMemo(() => {
    let filtered = coupons

    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter((c) => c.code.toLowerCase().includes(search))
    }

    if (filterStatus === 'active') {
      filtered = filtered.filter((c) => c.isActive)
    } else if (filterStatus === 'inactive') {
      filtered = filtered.filter((c) => !c.isActive)
    } else if (filterStatus === 'expired') {
      filtered = filtered.filter(
        (c) => c.expiresAt && new Date(c.expiresAt) < new Date(),
      )
    }

    return filtered
  }, [coupons, searchTerm, filterStatus])

  return (
    <div className="space-y-8 animate-slide-top">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight text-foreground">Coupons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage discount coupons ({coupons.length} coupon
            {coupons.length === 1 ? '' : 's'})
            {searchTerm || filterStatus !== 'all' ? (
              <span className="ml-2">• {filteredCoupons.length} shown</span>
            ) : null}
          </p>
        </div>
        <Button asChild className="h-9 rounded-lg font-medium">
          <Link to="/admin/promotions/coupons/new">
            <Icon name="plus" className="mr-2 h-4 w-4" />
            Add Coupon
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Icon
              name="magnifying-glass"
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
            />
            <Input
              placeholder="Search coupons by code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="sm:w-48">
          <Select
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value as typeof filterStatus)}
          >
            <SelectTrigger
              className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              aria-label="Filter by status"
            >
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Coupons</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="inactive">Inactive Only</SelectItem>
              <SelectItem value="expired">Expired Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-[14px]">
        <Table>
          <TableHeader>
            <TableRow className="border-b">
              <TableHead className="font-semibold">Code</TableHead>
              <TableHead className="font-semibold hidden md:table-cell">Discount</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">Usage</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">Starts</TableHead>
              <TableHead className="font-semibold hidden lg:table-cell">Expires</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCoupons.map((coupon) => (
              <CouponRow key={coupon.id} coupon={coupon} />
            ))}
          </TableBody>
        </Table>
      </Card>

      {coupons.length === 0 && (
        <div className="text-center py-16 animate-slide-top">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
            <Icon name="tags" className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No coupons yet</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Create your first discount coupon to offer promotions to your customers.
          </p>
          <Button asChild size="lg" className="h-9 rounded-lg font-medium">
            <Link to="/admin/promotions/coupons/new">
              <Icon name="plus" className="mr-2 h-4 w-4" />
              Add Coupon
            </Link>
          </Button>
        </div>
      )}

      {coupons.length > 0 && filteredCoupons.length === 0 && (searchTerm || filterStatus !== 'all') && (
        <div className="text-center py-16 animate-slide-top">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
            <Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No coupons found</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            {searchTerm ? (
              <>
                No coupons match your search for "<strong>{searchTerm}</strong>".
              </>
            ) : (
              <>No coupons match the selected filter.</>
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('')
                setFilterStatus('all')
              }}
              className="h-9 rounded-lg font-medium"
            >
              Clear filters
            </Button>
            <Button asChild className="h-9 rounded-lg font-medium">
              <Link to="/admin/promotions/coupons/new">
                <Icon name="plus" className="mr-2 h-4 w-4" />
                Add Coupon
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
