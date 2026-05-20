import { renderJsonLd, type JsonLdNode } from '#app/utils/json-ld.ts'

/**
 * Renders a <script type="application/ld+json"> tag with structured data.
 * Insert this anywhere in your route component — JSON-LD is valid throughout the DOM.
 *
 * @example
 * <JsonLd data={makeProductJsonLd({ name: 'Widget', sku: 'W-001', price: 1999, currency: 'USD', url: '...' })} />
 */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: renderJsonLd(data) }}
		/>
	)
}
