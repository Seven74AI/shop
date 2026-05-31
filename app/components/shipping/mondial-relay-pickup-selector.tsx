/**
 * Mondial Relay Pickup Point Selector Component
 * 
 * Allows users to search for and select a Mondial Relay pickup point (Point Relais®)
 */

import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import  { type PickupPoint } from '#app/utils/carriers/mondial-relay-api1.server.ts'

interface MondialRelayPickupSelectorProps {
	postalCode: string
	country: string
	city?: string
	selectedPickupPointId?: string
	onPickupPointSelect: (pickupPoint: PickupPoint | null) => void
	errors?: Array<string | null | undefined>
}

export function MondialRelayPickupSelector({
	postalCode,
	country,
	city,
	selectedPickupPointId,
	onPickupPointSelect,
	errors,
}: MondialRelayPickupSelectorProps) {
	const { t } = useTranslation()
	const [searchPostalCode, setSearchPostalCode] = useState(postalCode)
	const [searchCity, setSearchCity] = useState(city || '')
	const [selectedPoint, setSelectedPoint] = useState<PickupPoint | null>(null)

	const pickupPointsFetcher = useFetcher<{
		pickupPoints?: PickupPoint[]
		error?: string
		details?: Array<{ path: string[]; message: string }>
	}>()

	// Search for pickup points when postal code or country changes
	useEffect(() => {
		if (searchPostalCode && country && country.length === 2) {
			const params = new URLSearchParams({
				postalCode: searchPostalCode,
				country: country.toUpperCase(),
			})
			if (searchCity) {
				params.append('city', searchCity)
			}
			void pickupPointsFetcher.load(`/shop/checkout/pickup-points?${params.toString()}`)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchPostalCode, country, searchCity])

	// Update selected point when selectedPickupPointId changes
	useEffect(() => {
		if (selectedPickupPointId && pickupPointsFetcher.data?.pickupPoints) {
			const point = pickupPointsFetcher.data.pickupPoints.find(
				(p) => p.id === selectedPickupPointId,
			)
			if (point) {
				setSelectedPoint(point)
				onPickupPointSelect(point)
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedPickupPointId, pickupPointsFetcher.data])

	const pickupPoints = pickupPointsFetcher.data?.pickupPoints || []
	const isLoading = pickupPointsFetcher.state === 'loading'
	const hasError = pickupPointsFetcher.data?.error

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="pickup-search-postal">{t('mondialRelay.searchLabel')}</Label>
				<div className="flex gap-2">
					<div className="flex-1">
						<Input
							id="pickup-search-postal"
							type="text"
							placeholder={t('mondialRelay.postalPlaceholder')}
							value={searchPostalCode}
							onChange={(e) => setSearchPostalCode(e.target.value)}
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
					{country === 'FR' && (
						<div className="flex-1">
							<Input
								type="text"
								placeholder={t('mondialRelay.cityPlaceholder')}
								value={searchCity}
								onChange={(e) => setSearchCity(e.target.value)}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
						</div>
					)}
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							if (searchPostalCode && country) {
								const params = new URLSearchParams({
									postalCode: searchPostalCode,
									country: country.toUpperCase(),
								})
								if (searchCity) {
									params.append('city', searchCity)
								}
								void pickupPointsFetcher.load(`/shop/checkout/pickup-points?${params.toString()}`)
							}
						}}
						disabled={isLoading || !searchPostalCode || !country}
						className="transition-all duration-200"
					>
						<Icon name="magnifying-glass" className="h-4 w-4" />
					</Button>
				</div>
				<ErrorList errors={errors} />
			</div>

			{isLoading && (
				<div className="text-center py-4 text-muted-foreground">
					<Icon name="update" className="h-6 w-6 animate-spin mx-auto mb-2" />
					<p>{t('mondialRelay.searching')}</p>
				</div>
			)}

			{hasError && (
				<div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10">
					<p className="text-sm text-destructive">
						{pickupPointsFetcher.data?.error || t('mondialRelay.searchError')}
					</p>
				</div>
			)}

			{!isLoading && !hasError && pickupPoints.length > 0 && (
				<div className="space-y-2 max-h-96 overflow-y-auto">
					{pickupPoints.map((point) => (
						<Card
							key={point.id}
							className={`cursor-pointer transition-all duration-200 ${
								selectedPoint?.id === point.id
									? 'border-primary ring-2 ring-primary/20'
									: 'hover:border-primary/50'
							}`}
							onClick={() => {
								setSelectedPoint(point)
								onPickupPointSelect(point)
							}}
						>
							<CardContent className="p-4">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-2">
											<h4 className="font-semibold">{point.name}</h4>
											{selectedPoint?.id === point.id && (
												<Icon name="check" className="h-4 w-4 text-primary" />
											)}
										</div>
										<p className="text-sm text-muted-foreground mb-1">{point.address}</p>
										<p className="text-sm text-muted-foreground">
											{point.postalCode} {point.city}, {point.country}
										</p>
										{point.distance && (
											<p className="text-xs text-muted-foreground mt-1">
														{t('mondialRelay.distance', { distance: point.distance })}
											</p>
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{!isLoading && !hasError && pickupPoints.length === 0 && searchPostalCode && (
				<div className="text-center py-8 text-muted-foreground">
					<p>{t('mondialRelay.noResults')}</p>
					<p className="text-sm mt-2">{t('mondialRelay.tryDifferent')}</p>
				</div>
			)}

			{selectedPoint && (
				<div className="p-4 border rounded-lg bg-muted/50">
					<div className="flex items-start justify-between">
						<div>
							<p className="font-semibold text-sm mb-1">{t('mondialRelay.selectedPoint')}</p>
							<p className="text-sm">{selectedPoint.name}</p>
							<p className="text-xs text-muted-foreground">
								{selectedPoint.address}, {selectedPoint.postalCode} {selectedPoint.city}
							</p>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setSelectedPoint(null)
								onPickupPointSelect(null)
							}}
							className="transition-all duration-200"
						>
							<Icon name="cross-1" className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

