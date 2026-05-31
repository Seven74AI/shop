import { invariantResponse } from '@epic-web/invariant'
import {
	redirect,
	Form,
	Link,
	useFetcher,
	useSearchParams,
	useSubmit,
} from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Field } from '#app/components/forms.tsx'
import { Spacer } from '#app/components/spacer.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { useDebounce, useDoubleCheck } from '#app/utils/misc.tsx'
import { type Route } from './+types/cache.ts'



export default function CacheAdminRoute({ loaderData }: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const query = searchParams.get('query') ?? ''
	const limit = searchParams.get('limit') ?? '100'
	const instance = searchParams.get('instance') ?? loaderData.instance

	const handleFormChange = useDebounce(async (form: HTMLFormElement) => {
		await submit(form)
	}, 400)

	return (
		<div className="container">
			<h1 className="text-h1">Cache Admin</h1>
			<Spacer size="2xs" />
			<Form
				method="get"
				className="flex flex-col gap-4"
				onChange={(e) => handleFormChange(e.currentTarget)}
			>
				<div className="flex-1">
					<div className="flex flex-1 gap-4">
						<button
							type="submit"
							className="flex h-16 items-center justify-center"
						>
							🔎
						</button>
						<Field
							className="flex-1"
							labelProps={{ children: 'Search' }}
							inputProps={{
								type: 'search',
								name: 'query',
								defaultValue: query,
							}}
						/>
						<div className="text-muted-foreground flex h-16 w-14 items-center text-lg font-medium">
							<span title="Total results shown">
								{loaderData.cacheKeys.sqlite.length +
									loaderData.cacheKeys.lru.length}
							</span>
						</div>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-4">
					<Field
						labelProps={{
							children: 'Limit',
						}}
						inputProps={{
							name: 'limit',
							defaultValue: limit,
							type: 'number',
							step: '1',
							min: '1',
							max: '10000',
							placeholder: 'results limit',
						}}
					/>
					<select name="instance" defaultValue={instance} aria-label="Cache instance">
						{Object.entries(loaderData.instances).map(([inst, region]) => (
							<option key={inst} value={inst}>
								{[
									inst,
									`(${region})`,
									inst === loaderData.currentInstanceInfo.currentInstance
										? '(current)'
										: '',
									inst === loaderData.currentInstanceInfo.primaryInstance
						? ' (primary)'
								: '',
							].filter(Boolean)
							.join(' ')}
							</option>
						))}
					</select>
				</div>
			</Form>
			<Spacer size="2xs" />
			<div className="flex flex-col gap-4">
				<h2 className="text-h2">LRU Cache:</h2>
				{loaderData.cacheKeys.lru.map((key) => (
					<CacheKeyRow
						key={key}
						cacheKey={key}
						instance={instance}
						type="lru"
					/>
				))}
			</div>
			<Spacer size="3xs" />
			<div className="flex flex-col gap-4">
				<h2 className="text-h2">SQLite Cache:</h2>
				{loaderData.cacheKeys.sqlite.map((key) => (
					<CacheKeyRow
						key={key}
						cacheKey={key}
						instance={instance}
						type="sqlite"
					/>
				))}
			</div>
		</div>
	)
}

function CacheKeyRow({
	cacheKey,
	instance,
	type,
}: {
	cacheKey: string
	instance?: string
	type: 'sqlite' | 'lru'
}) {
	const fetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()
	const encodedKey = encodeURIComponent(cacheKey)
	const valuePage = `/admin/cache/${type}/${encodedKey}?instance=${instance}`
	return (
		<div className="flex items-center gap-2 font-mono">
			<fetcher.Form method="POST">
				<input type="hidden" name="cacheKey" value={cacheKey} />
				<input type="hidden" name="instance" value={instance} />
				<input type="hidden" name="type" value={type} />
				<Button
					size="sm"
					variant="secondary"
					{...dc.getButtonProps({ type: 'submit' })}
				>
					{fetcher.state === 'idle'
						? dc.doubleCheck
							? 'You sure?'
							: 'Delete'
						: 'Deleting...'}
				</Button>
			</fetcher.Form>
			<Link reloadDocument to={valuePage}>
				{cacheKey}
			</Link>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<p>You are not allowed to do that: {error?.data.message}</p>
				),
			}}
		/>
	)
}
