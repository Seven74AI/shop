# CONTEXT.md — Shop Domain Glossary

Single-context domain glossary for the Shop e-commerce application. This file defines the canonical vocabulary used across the codebase — use these terms in issue titles, commit messages, test names, and refactor proposals.

## Domain Vocabulary

### Catalog

- **Product** — A sellable item with name, slug, SKU, description, price (in integer cents per ADR 001), status (DRAFT | ACTIVE | ARCHIVED), optional weight, and tax kind. Every product belongs to exactly one Category. May have zero or more ProductVariants and ProductImages.
- **ProductVariant** — A specific configuration of a product (e.g., "Size M, Color Black") with its own SKU, price override (nullable — falls back to product price), stock quantity, and optional weight override. Connected to AttributeValues via the VariantAttributeValue junction table.
- **Attribute** — A global attribute dimension usable across any product (e.g., "Size", "Color", "Material"). Has a name, optional display order.
- **AttributeValue** — A concrete value within an attribute (e.g., "M", "L", "XL" for Size). Unique per (attributeId, value) pair.
- **VariantAttributeValue** — Junction table linking a ProductVariant to its AttributeValues. Composite primary key on (variantId, attributeValueId).
- **Category** — Hierarchical product grouping with name, slug, optional description, and optional parentId for nesting. Products cascade under child categories; categories form a tree via self-referencing `CategoryHierarchy` relation.
- **ProductImage** — An image attached to a product, stored by objectKey (Tigris in production, fixture files in dev via MSW). Has alt text and display order for sorting.
- **ProductTag** — A freeform tag attached to products via the ProductToTag junction table. Used for filtering and merchandising.
- **ProductStatus** — Lifecycle state of a product: DRAFT (not visible), ACTIVE (visible in storefront), ARCHIVED (hidden, retained for order history).
- **Currency** — Store-level currency (ADR 002: not per-product). Defined by ISO code, name, symbol, and decimal places for display formatting. The active currency is set via the Settings singleton.
- **Settings** — Singleton model (id = "settings") holding store-wide configuration: currently the active currencyId.

### Pricing & Tax

- **Price (cents)** — All prices are stored as integers representing cents (ADR 001). $10.99 = 1099. The `formatPrice()` utility in `app/utils/price.ts` handles display conversion using the store currency's symbol and decimals.
- **TaxKind** — Tax category enum: STANDARD, REDUCED, SUPER_REDUCED, ZERO. Assigned per-product and used for VAT calculation.
- **TaxRate** — Per-country, per-kind tax rate stored in basis points (2000 = 20.00%). Has effective dates (effectiveFrom/effectiveTo) for historical accuracy.
- **VAT Breakdown** — JSON array on Order and Invoice recording per-kind VAT at transaction time: `[{ kind, rate, baseCents, vatCents }]`. Snapshotted so historical invoices remain accurate even if rates change.
- **Coupon** — Discount code applied by customer at checkout. Supports percentage (basis points) or fixed amount (cents). Has optional usage limits, date range, and minimum order amount.
- **Promotion** — Site-wide or targeted discount applied automatically. Same DiscountType options as coupons. Displayed via banner or automatic application logic.
- **DiscountType** — PERCENTAGE (value in basis points, 1000 = 10.00%) or FIXED_AMOUNT (value in cents).

### Cart & Checkout

- **Cart** — Shopping cart tied to either a User (authenticated) or a sessionId (guest). Supports abandoned cart recovery tracking (recoveryEmailSentAt, recoveryEmailCount). Cart merges on login: guest cart items transfer to the authenticated user's cart.
- **CartItem** — A line item in the cart: product, optional variant, and quantity. Unique constraint on (cartId, productId, variantId).
- **Checkout** — Multi-step flow under `shop+/checkout+/`: delivery address → shipping method → payment (Stripe) → review → success. See `docs/checkout-success-page.md` for the webhook fallback mechanism.
- **Stripe Checkout Session** — Created by `app/utils/stripe.server.ts` and `app/utils/checkout.server.ts`. The session ID is stored on the Order. On successful payment, Stripe sends a webhook to `app/routes/webhooks+/` which transitions the order to CONFIRMED.

### Orders & Fulfillment

- **Order** — Core transactional record with immutable price snapshots (subtotal, total, shipping cost, VAT breakdown) and shipping address snapshot. Linked to a User (nullable — persists after user deletion per French tax law 6-year retention). Key fields: orderNumber (human-readable "ORD-XXXXXX"), stripeCheckoutSessionId (unique), status, shipping fields.
- **OrderItem** — Line item on an order: product, optional variant, quantity, and price snapshot at order time.
- **OrderStatus** — Lifecycle: PENDING → CONFIRMED → SHIPPED → DELIVERED. CANCELLED is a terminal state reachable from PENDING or CONFIRMED. Orders auto-confirm on successful Stripe payment.
- **ShippingMethod** — Carrier + zone combination with a rate calculation strategy: FLAT (fixed cents), WEIGHT_BASED (JSON weight brackets), PRICE_BASED (JSON price brackets), or FREE (with optional threshold). Has estimated delivery days.
- **Carrier** — Shipping provider (e.g., Mondial Relay). Has name, display name, API integration config, and geographic availability (availableCountries, availableZoneIds). Currently only Mondial Relay is integrated (ADR 003: abstraction deferred until second carrier).
- **ShippingZone** — Geographic region (e.g., "Europe") defined by an array of ISO country codes. ShippingMethods are assigned to zones.
- **Mondial Relay** — Currently the only integrated carrier. Order carries carrier-specific columns (`mondialRelayPickupPointId`, `mondialRelayPickupPointName`, `mondialRelayShipmentNumber`, `mondialRelayLabelUrl`). See ADR 003 for the planned polymorphic `OrderShipment` refactor.
- **Fulfillment** — Admin-side order processing: creating shipments, generating labels, syncing tracking info. Implemented in `app/utils/fulfillment.server.ts`, `app/utils/shipment.server.ts`, `app/utils/label.server.ts`, `app/utils/tracking.server.ts`.
- **ReturnRequest** — Customer-initiated return with lifecycle: REQUESTED → APPROVED → SHIPPED → RECEIVED → REFUNDED. REJECTED is a terminal state. Tracks refund amount, restocking fee, and return reason.

### Invoices & Accounting

- **Invoice** — Fiscal document with sequential numbering per fiscal year ("F2025-00001"). Generated atomically via `withInvoiceLock()` in `app/utils/invoice.server.ts`. Immutable snapshot of subtotal, total, and VAT breakdown at issuance time.
- **InvoiceKind** — INVOICE (standard) or CREDIT_NOTE (corrects a previous invoice, linked via parentInvoiceId self-reference).
- **Invoice Status** — DRAFT → FINAL (issued). CANCELLED for voided invoices. PARTIALLY_REFUNDED / REFUNDED track refund state.
- **Credit Note** — An Invoice with kind=CREDIT_NOTE that corrects a parent invoice. Carries a reason field (e.g., "return", "damaged", "partial refund").

### Users & Auth

- **User** — Account with email, username, optional name. Has notification preferences, roles, sessions, connections (OAuth), passkeys, addresses, cart, orders, and reviews.
- **Role** — Named role with associated Permissions. Standard roles: "admin", "user".
- **Permission** — (action, entity, access) tuple. action ∈ {create, read, update, delete}, entity is a domain object, access ∈ {own, any}.
- **Session** — Time-limited authentication session with expiration date.
- **Connection** — OAuth provider link (providerName + providerId). Unique per provider.
- **Passkey** — WebAuthn credential for passwordless authentication. Stores public key, device type, backup status.
- **LoginAttempt** — Audit record of login attempts (success/failure, IP, user agent).
- **Verification** — OTP-based verification for email or phone. Uses TOTP-style secret + algorithm.
- **Address** — User's saved address with type (SHIPPING, BILLING, BOTH). Default flags for shipping/billing. Has a user-defined label.

### Reviews

- **Review** — Product rating (1-5 stars) with optional title, body, and verified purchase flag. Requires admin approval (isApproved) before public display. Linked to both user and order (for verified purchase tracking).

### Newsletter

- **NewsletterSubscription** — Double-opt-in email subscription with HMAC-signed confirmation token. Status: PENDING → CONFIRMED → UNSUBSCRIBED. Token expires after 7 days.

### Feature Flags

- **Flag** — Runtime feature toggle keyed by string. Supports rollout percentage and audience targeting (JSON: userIds, countries). Used for gradual rollouts and operational kill switches. See `docs/feature-flags.md`.

### Audit & Compliance

- **AuditLog** — Immutable record of security-relevant actions (CREATE, UPDATE, DELETE, LOGIN, LOGOUT) on domain entities. Persists after user deletion (userId → null). Retained for 6 years per French tax law (CGI art. L. 102 B). See `docs/data-retention.md`.
- **IdempotencyRecord** — Tracks Stripe idempotency keys (24h TTL) to prevent duplicate payment processing. See P2 Reliability phase.
- **WebhookEvent** — Idempotent webhook processing: stores incoming Stripe events by provider-side eventId, tracks processing status and retry attempts.

## Architecture Concepts

### Stack

- **Runtime**: Node.js with Express 5 server
- **Framework**: React Router 7 with `remix-flat-routes` (`@react-router/remix-routes-option-adapter`)
- **ORM**: Prisma 7 with `better-sqlite3` adapter (NOT libsql — causes timeout in CI)
- **Database**: SQLite with LiteFS replication on Fly.io (single-primary, async replication)
- **Package manager**: pnpm 10.9.0
- **Payments**: Stripe Checkout + webhooks
- **Image storage**: Tigris (production), fixture files + MSW mocks (development)

### Route Conventions

- `+` suffix directories are route folders (e.g., `admin+/products+/`)
- `_layout.tsx` = pathless layout, `_index.tsx` = index route
- `$param.tsx` = dynamic parameter, `foo_.bar.tsx` = sibling route (not nested)
- `.server.ts` / `.client.tsx` = colocated non-route modules (ignored by router)
- `__name.tsx` = shared route internals (ignored by router)

### Route Areas

| Area | Path | Purpose |
|------|------|---------|
| `_auth+` | `/login`, `/signup`, etc. | Authentication: login, signup, onboarding, verify, passkeys, OAuth |
| `_marketing+` | `/` | Public marketing pages |
| `_seo+` | `/sitemap.xml`, `/robots.txt` | SEO artifacts |
| `shop+` | `/products`, `/cart`, `/checkout`, `/orders` | Storefront: catalog browsing, cart, checkout flow |
| `admin+` | `/admin` | Admin dashboard (role-protected): CRUD for products, categories, attributes, users, orders, shipping, cache inspector |
| `account+` | `/account` | User settings, profile |
| `users+` | `/users` | Public user profile pages |
| `resources+` | `/resources` | Image/asset serving |
| `webhooks+` | `/webhooks` | Stripe webhook receiver |

### Key Utilities (`app/utils/`)

| File | Purpose |
|------|---------|
| `price.ts` | `formatPrice()` — converts integer cents to display string using currency symbol/decimals |
| `settings.server.ts` | `getStoreCurrency()` — returns the active Currency from the Settings singleton |
| `stripe.server.ts` | Stripe Checkout Session creation |
| `checkout.server.ts` | Checkout orchestration: cart → Stripe session |
| `order.server.ts` | Order lifecycle management (see `docs/archive/order-management-system.plan.md`) |
| `shipment.server.ts` | Create Mondial Relay shipments |
| `label.server.ts` | Generate/download shipping labels |
| `tracking.server.ts` | Sync tracking info from carrier API |
| `tracking-status.server.ts` | Map carrier tracking status to OrderStatus |
| `fulfillment.server.ts` | Admin fulfillment orchestration |
| `invoice.server.ts` | Invoice generation with fiscal-year sequential numbering |
| `litefs.server.ts` | LiteFS primary/replica awareness for write routing |
| `carriers/` | Carrier API clients (currently only Mondial Relay API1/API2) |
| `providers/` | Provider integrations |

### State, Forms & Validation

- Forms use `@conform-to/react` + `@conform-to/zod` with Zod v4 schemas in `app/schemas/`
- Zod v4 uses `error` parameter (not `message`) — see `docs/implementation-notes.md#schema-validation`
- No client-side data fetching framework — server loaders/actions are the source of truth
- Avoid `useEffect` for derived state; prefer event handlers, ref callbacks, `useSyncExternalStore`

### Testing

- **Vitest** (unit/integration): Colocated `*.test.{ts,tsx}` in `app/`. Setup in `tests/setup/`. Tests must not depend on seed data — use helpers in `tests/db-utils.ts`, `tests/user-utils.ts`, `tests/product-utils.ts`.
- **Playwright** (E2E): Tests in `tests/e2e/`. Use custom `test`/`expect` from `tests/playwright-utils.ts`. Isolate test data per-test (timestamps/UUIDs).
- **MSW** (mocking): Handlers in `tests/mocks/` mock Stripe, Resend, Tigris, GitHub OAuth. Both dev server (`MOCKS=true`) and E2E (`start:mocks`) use them.
- **axe-core** (a11y): Suite at `tests/e2e/a11y.test.ts`. Target: WCAG 2.1 AA. See `docs/accessibility-testing.md`.

### Build & Deploy

- **Build artifacts** (do not hand-edit): `.react-router/`, `build/`, `server-build/`, `app/components/ui/icons/`
- **Deploy**: Fly.io via `.github/workflows/deploy.yml`
- **CI**: vitest + typecheck (tsc via `react-router typegen`) + lint (oxlint) + playwright

## Architecture Decision Records

Key decisions are recorded in `docs/decisions/`. Each is immutable once accepted; superseded decisions are linked forward.

| ADR | Title | Status |
|-----|-------|--------|
| [001](docs/decisions/001-price-storage-as-integer-cents.md) | Price Storage as Integer Cents | Accepted |
| [002](docs/decisions/002-store-level-currency.md) | Store-Level Currency Configuration | Accepted |
| [003](docs/decisions/003-carrier-coupling-deferred.md) | Carrier Coupling — Mondial Relay Hardcoded, Abstraction Deferred | Accepted (deferred) |
| [005](docs/decisions/005-sqlite-scaling-cliff.md) | SQLite Scaling Cliff Trigger Conditions | Proposed |

## Key Documentation

| Document | Purpose |
|----------|---------|
| `docs/README.md` | Index of all architecture docs |
| `docs/implementation-notes.md` | Key architectural decisions, trade-offs, lessons learned |
| `docs/relational-variants.md` | Normalized variant database design (vs JSON) |
| `docs/product-images.md` | Fixture-based image system |
| `docs/admin-dashboard.md` | Admin interface architecture |
| `docs/checkout-success-page.md` | Webhook fallback for checkout success |
| `docs/accessibility-testing.md` | WCAG 2.1 AA testing with axe-core |
| `docs/data-retention.md` | 6-year data retention per French tax law |
| `docs/feature-flags.md` | Feature flag system |
| `docs/archive/order-management-system.plan.md` | Order lifecycle documentation |
| `docs/MODERN_ADMIN_PAGES.md` | Modern admin page patterns |

## Agent Documentation

| Document | Purpose |
|----------|---------|
| `docs/agents/domain.md` | How agents should consume this CONTEXT.md |
| `docs/agents/issue-tracker.md` | Issue tracker configuration |
| `docs/agents/triage-labels.md` | Triage label definitions |
