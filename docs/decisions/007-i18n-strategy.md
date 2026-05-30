# ADR 007: i18n Strategy — Locale Detection, Translation Loading, and Formatting

## Status
Accepted

## Context
The Shop application serves customers in both France and English-speaking markets. We need internationalization (i18n) covering:

1. **UI translations** — all user-visible text (navigation, forms, error messages, marketing pages, checkout flow)
2. **Email translations** — transactional emails (order confirmation, shipping notification, credit note) in the customer's preferred language
3. **Locale-aware formatting** — dates, prices, and addresses formatted according to the user's locale
4. **Locale detection** — automatically determine the best locale for each request
5. **Stripe integration** — pass locale to Stripe Checkout for native payment UI localization

The system must be lightweight (the app currently supports 2 locales: French `fr` and English `en`) but designed with a clear migration path for N ≥ 5 locales in the future.

## Decision

### 1. Locale Enum: 2-Locale (`fr` | `en`)

The `Locale` type is a simple string union of `'fr' | 'en'` defined in `app/utils/i18n.server.ts`. This is intentionally minimal — the migration path (see § Future Migration Path) describes how to scale to more locales.

```typescript
export type Locale = 'fr' | 'en'
export type TranslationDict = Record<string, string>
```

### 2. Three-Tier Locale Detection

Locale is determined server-side using a three-tier priority system:

1. **`localePreference` cookie** — explicit user choice, set via the locale switcher UI (`app/routes/resources+/locale-switch.tsx`). Cookie attributes: `maxAge=365 days`, `SameSite=Lax`, not `HttpOnly` (so the client can read it for initial render).
2. **`Accept-Language` header** — browser preference, parsed via `intl-parse-accept-language`. Only the primary language code is considered (e.g., `fr-FR,en;q=0.9` → `fr`).
3. **Default fallback** — `'en'` when neither cookie nor header provides a supported locale.

```typescript
// app/utils/i18n.server.ts
export function getLocale(request: Request): Locale {
  // 1. Cookie (explicit user preference)
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const parsed = cookie.parse(cookieHeader)
    const cookieLocale = parsed['localePreference']
    if (isSupportedLocale(cookieLocale)) return cookieLocale
  }
  // 2. Accept-Language header
  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage)
    for (const lang of parsed) {
      const shortLocale = ensureShortLocale(lang)
      if (isSupportedLocale(shortLocale)) return shortLocale
    }
  }
  // 3. Default
  return 'en'
}
```

### 3. Flat Dot-Notation Translation Dictionary

Translations are stored as **flat JSON files** with dot-notation keys (e.g., `app/locales/en/common.json`, `app/locales/fr/common.json`):

```json
{
  "nav.home": "Home",
  "nav.shop": "Shop",
  "footer.locale.label": "Language",
  "checkout.shipping.address": "Shipping Address",
  "error.general": "Something went wrong"
}
```

The `TranslationDict` type is `Record<string, string>` — a flat key-value map. A defensive `flattenObject()` utility handles the case where a nested JSON object is accidentally provided, recursively flattening it to dot-notation on load.

**Why flat, not nested:** The original PR #101 used nested JSON objects (`{ footer: { locale: { fr: "Français" } } }`) but this caused `useTranslation()` flat key lookup to fail — `t('footer.locale.fr')` returned the raw key string `"footer.locale.fr"` instead of `"Français"`. Flattening to dot-notation made the `TranslationDict = Record<string, string>` type work correctly.

### 4. Dynamic Translation Loading with cachified LRU

Translations are loaded dynamically on the server:

```typescript
export async function getTranslations(locale: Locale, namespace?: string): Promise<TranslationDict> {
  const cacheKey = namespace ? `${locale}:${namespace}` : locale
  return cachified({
    key: cacheKey,
    cache: lruCache,
    async getFreshValue() {
      const mod = await import(`#app/locales/${locale}/common.json`)
      return flattenObject(mod.default ?? mod)
    },
  })
}
```

- **Dynamic `import()`** — each locale JSON is loaded on-demand (not bundled into all route bundles)
- **`cachified` with LRU cache** — translations are cached in-memory after first load, avoiding repeated filesystem reads
- **Optional namespace parameter** — designed for future namespace splitting (e.g., `common`, `checkout`, `admin`)
- **`flattenObject()` defensive** — handles nested JSON objects that might slip through

### 5. React TranslationProvider + useTranslation Hook

The React component tree is wrapped in a `TranslationProvider` context at the layout level:

```tsx
// app/utils/i18n.tsx
export function TranslationProvider({ children, locale, translations }) {
  const t = (key: string, params?: Record<string, string | number>) => {
    let value = translations[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v))
      }
    }
    return value
  }
  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback: return raw key when used outside TranslationProvider
    return { locale: 'en', t: (key: string) => key }
  }
  return ctx
}
```

Key design choices:
- **ICU-light `{variable}` interpolation** — simple string replacement with `{varName}` placeholders. No pluralization, no gender, no ICU MessageFormat — just `{var}`.
- **Fallback to raw key** — `useTranslation()` returns the translation key as-is when used outside a `TranslationProvider` (e.g., in error boundaries). This prevents crashes.
- **`createT()` for non-React contexts** — `createT(translations)` returns a standalone `t()` function for use in email templates and server-side formatting.

### 6. Locale-Aware Formatting

Three levels of locale-aware formatting:

**Dates** (`app/utils/date.ts`):
- `formatDate(date, locale?, opts?)` — uses `Intl.DateTimeFormat` with the correct locale
- `localeToIntl()` maps `'fr' → 'fr-FR'`, `'en' → 'en-GB'` (European date formats: DD/MM/YYYY for French, DD/MM/YYYY for British English)
- Options: `dateStyle`, `timeStyle`, or shorthand `format: 'short' | 'long' | 'full'`

**Prices** (`app/utils/price.ts`):
- `formatPrice(priceInCents, currency?, locale?)` — uses `Intl.NumberFormat` when a locale is provided
- Backward-compatible: old `formatPrice(x)` and `formatPrice(x, currency)` calls still work (locale parameter is optional)

**Addresses** (`app/utils/address.ts`):
- `formatAddress(address, locale)` — formats the address string with country-specific layouts
- Layout types: `eu-standard` (FR, DE, BE, NL), `with-province` (IT, ES), `us-standard` (default)
- Country names use a small static lookup table (8 countries currently supported)

### 7. Email Locale from taxCountry

Transactional emails derive their locale from the order's `taxCountry`:
- `FR` → `fr`
- All other countries → `en`

```typescript
function getOrderLocale(order: Order): Locale {
  return order.taxCountry === 'FR' ? 'fr' : 'en'
}
```

This ensures French customers receive French emails regardless of their browser language preference.

### 8. Stripe Checkout Locale Passthrough

The Stripe Checkout session creation passes the detected locale to Stripe, which handles the payment UI localization natively:

```typescript
const session = await stripe.checkout.sessions.create({
  locale: locale === 'fr' ? 'fr' : 'en',
  // ...
})
```

## Consequences

### Positive
- ✅ **Lightweight** — flat `Record<string, string>` dictionary with simple `{var}` interpolation. No i18n framework dependency.
- ✅ **Zero client-side JS for translations** — translations are server-loaded and injected via context. No flash of untranslated content.
- ✅ **Graceful degradation** — `useTranslation()` returns raw keys when used outside `TranslationProvider` (error boundaries, SSR mismatches)
- ✅ **Browser-native formatting** — `Intl.DateTimeFormat` and `Intl.NumberFormat` are used directly, no locale data bundles
- ✅ **Cache-friendly** — `cachified` LRU avoids repeated filesystem reads for translations
- ✅ **Stripe integration** — locale passed through to Stripe for native payment UI localization
- ✅ **Backward-compatible** — `formatPrice()` accepts both old (no locale) and new signatures

### Negative
- ⚠️ **No pluralization** — `{var}` interpolation cannot handle "1 item" vs "2 items". Currently worked around with separate keys (`checkout.cart.itemCount.one` / `checkout.cart.itemCount.many`)
- ⚠️ **No gender handling** — French gendered strings need separate keys (e.g., `user.greeting.male` / `user.greeting.female`)
- ⚠️ **Single flat namespace** — all 333 translation keys share one namespace (`common`). Becomes unwieldy at 500+ keys
- ⚠️ **No translation management system (TMS)** — translators must edit JSON files directly. OK for 2 locales, becomes unmanageable at N ≥ 5
- ⚠️ **Flat keys duplicate structure** — `checkout.shipping.address.line1`, `checkout.shipping.address.line2`, etc. Namespace splitting would reduce this

### Neutral
- 📝 **Two locales is intentional** — the system is designed for `fr` and `en` today. Adding a 3rd locale (e.g., `de`) requires only: (1) adding to the `Locale` union, (2) creating `app/locales/de/common.json`, (3) updating `localeToIntl()`. All existing infrastructure handles it.
- 📝 **English default** — `'en'` is the fallback for all unknown locales. This means a German browser without a locale cookie sees English, not French. This is acceptable because English is the broader international default.

## Future Migration Path (N ≥ 5 Locales)

When the application needs 5+ locales, the following upgrades should be made:

1. **Namespace splitting** — split `common.json` into `common.json` (shared UI), `checkout.json` (checkout flow), `admin.json` (admin dashboard), `emails.json` (transactional emails). Each namespace is loaded independently via `getTranslations(locale, namespace)`.

2. **ICU pluralization** — replace `{var}` interpolation with `intl-messageformat` or `@formatjs/intl` for proper pluralization, gender, and ordinal rules. This is overkill for 2 locales but becomes necessary at 5+ where "1 item / 2 items / 5 items" rules diverge across languages.

3. **URL-path routing re-evaluation** — consider `/{locale}/products` style routing (e.g., `/fr/produits`, `/en/products`) for SEO. This was rejected for the 2-locale case because it breaks React Router v7 flat-route conventions and requires route duplication. At 5+ locales, the SEO benefit may justify the complexity.

4. **Translation management system (TMS)** — adopt a TMS (Lokalise, Crowdin, or Phrase) for translator workflows. Direct JSON editing does not scale to 5+ languages with multiple contributors.

5. **Locale-aware URL generation** — add `hreflang` alternate links to `<head>` and sitemap for multi-locale SEO.

## Alternatives Considered

### Alternative 1: react-i18next (full i18n framework)
- ICU MessageFormat, pluralization, namespaces, TMS integration out of the box
- **Rejected**: Overkill for 2 locales with 333 translation keys. Adds ~50KB gzipped to the bundle, introduces `react-i18next` + `i18next` + `i18next-browser-languagedetector` dependency chain. The built-in `TranslationProvider` + `useTranslation()` pattern achieves the same result with ~2KB.

### Alternative 2: URL-path locale routing (`/fr/products`, `/en/products`)
- Clean URLs, SEO-friendly, no cookie dependency
- **Rejected**: React Router v7 flat-routes convention maps file paths to URLs directly. Adding a `:locale` prefix requires either route duplication (`app/routes/fr+/products.tsx` and `app/routes/en+/products.tsx`) or a root-level splat route that manually handles locale — both break the flat-routes convention. The cookie + `Accept-Language` approach is simpler and avoids SEO issues with `hreflang` tags.

### Alternative 3: Subdomain routing (`fr.shop.com`, `en.shop.com`)
- Strong SEO signal, clear locale separation
- **Rejected**: Infrastructure complexity. Requires DNS configuration, SSL certificates for each subdomain, and separate deployments. Not justified for 2 locales on a single Fly.io deployment.

### Alternative 4: Client-only i18n (no server-side detection)
- Simplest implementation — detect locale in the browser, load translations client-side
- **Rejected**: Flash of untranslated content (FOUC). The initial HTML render would show English (or keys) until the JS bundle loads and detects the locale. Server-side detection via cookie + `Accept-Language` provides the correct locale on the first render with zero client-side JS.

## Related Decisions
- ADR 001: Price Storage as Integer Cents (prices formatted via `formatPrice()` with optional locale parameter)
- ADR 002: Store-Level Currency Configuration (currency symbol and decimal formatting)
- ADR 006: Invoice Numbering and PDF Archival (invoice PDFs use locale-aware formatting)

## References
- [Intl.DateTimeFormat (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) — browser-native date formatting
- [Intl.NumberFormat (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) — browser-native number/currency formatting
- [cachified](https://github.com/epicweb-dev/cachified) — LRU caching utility used for translation loading
- [intl-parse-accept-language](https://github.com/tc39/proposal-intl-localematcher) — Accept-Language header parser
- [React Router v7 flat-routes](https://github.com/kiliman/remix-flat-routes) — route convention that constrains URL-path routing
- PR #101: i18n E2E fix + flat locale JSON (merged `44dcf6f`)
- PR #112: French translations for checkout flow (merged to `Seven74AI/shop`, #112)
- PR #113: Locale-aware date/number/address formatting (merged to `Seven74AI/shop` #113)
- PR #194: i18n consolidation to upstream `mnlamart/shop` (#194)
- Implementation: `app/utils/i18n.server.ts`, `app/utils/i18n.tsx`, `app/utils/date.ts`, `app/utils/price.ts`, `app/utils/address.ts`
- Locale files: `app/locales/en/common.json` (333 keys), `app/locales/fr/common.json` (333 keys)
