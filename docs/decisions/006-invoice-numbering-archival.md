# ADR 006: Invoice Numbering and PDF Archival

## Status
Accepted

## Context
The Shop application generates invoices and credit notes (avoirs) for customer orders. Under French tax law (Code Général des Impôts art. L. 102 B), invoices must use a **gapless sequential numbering scheme** — no gaps, no skips, no parallel numbering series for different document types. Credit notes must share the same sequence as invoices because they correct previously issued invoices.

Additionally, the French Code de commerce (art. L. 123-22) requires **10-year retention** of all commercial documents — invoices must be stored and retrievable for a decade.

We need to define:

1. **How invoice numbers are generated** — ensuring gapless sequential numbering without gaps under concurrency
2. **How credit notes share the sequence** — they are corrections, not separate documents
3. **How PDFs are archived** — durable storage with on-the-fly re-rendering fallback
4. **Retention lifecycle** — active, warm, and cold storage tiers over 10 years

## Decision

### 1. Invoice Numbering Scheme: `F{year}-{sequence:05d}`

Invoice numbers follow the format `F{year}-{sequence:05d}` — e.g., `F2025-00001`, `F2025-00042`, `F2026-00150`.

- The `F` prefix disambiguates from other numeric identifiers in the system
- The 4-digit fiscal year groups invoices by tax period
- The zero-padded 5-digit sequence provides room for 99,999 invoices per year
- **Credit notes share the same sequence** — an `Invoice` record can have `kind: INVOICE` or `kind: CREDIT_NOTE`, and both draw from the same `{fiscalYear, sequence}` numbering pool per French CGI art. L. 102 B

The `@@unique([fiscalYear, sequence])` constraint on the `Invoice` model provides a database-level safety net against race conditions.

### 2. Atomic Generation via Promise-Chain Lock + Prisma Transaction

Invoice number generation uses a **two-layer locking strategy**:

1. **Promise-chain lock** (`withInvoiceLock()`) — serializes all invoice creation operations in the Node.js process. Sufficient for a single-process LiteFS primary where there is only one writer process.

2. **Prisma `$transaction`** with `BEGIN IMMEDIATE` — provides the database-level atomicity. The transaction reads `MAX(sequence)` for the fiscal year and writes the next number in a single atomic operation.

```typescript
// app/utils/invoice-numbering.server.ts
export async function generateInvoiceNumber(
  fiscalYear: number,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  if (tx) {
    // Use existing transaction (for composition within larger operations)
    const lastInvoice = await tx.invoice.findFirst({
      where: { fiscalYear },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    const nextSequence = lastInvoice && !isNaN(lastInvoice.sequence)
      ? lastInvoice.sequence + 1 : 1
    return formatInvoiceNumber(fiscalYear, nextSequence)
  }
  // Standalone: use Prisma transaction with timeout guards
  return await prisma.$transaction(async (transactionTx) => {
    const lastInvoice = await transactionTx.invoice.findFirst({
      where: { fiscalYear },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    const nextSequence = lastInvoice && !isNaN(lastInvoice.sequence)
      ? lastInvoice.sequence + 1 : 1
    return formatInvoiceNumber(fiscalYear, nextSequence)
  }, { maxWait: 5000, timeout: 10000 })
}
```

The sequence resets on January 1 of each new fiscal year (the `fiscalYear` parameter changes, so `MAX(sequence)` for the new year returns null → sequence starts at 1).

### 3. PDF Archival: Tigris S3-Compatible Storage

PDFs are stored on Tigris (S3-compatible object storage, used by Fly.io) at the path:

```
invoices/{year}/{invoiceNumber}.pdf
```

Example: `invoices/2025/F2025-00042.pdf`

The `app/utils/storage.server.ts` module handles upload via AWS SDK (S3-compatible API). In mock mode (`MOCKS=true`), the upload step is skipped.

If a stored PDF is unavailable (e.g., cold storage migration, network issue), the PDF is **re-rendered on-the-fly** from the stored `Invoice` record and its associated `Order` data using `@react-pdf/renderer` (`app/utils/invoice-pdf.server.tsx`). This ensures PDFs are always retrievable even without the storage backend.

### 4. Retention Lifecycle

| Phase | Duration | Storage | Access |
|-------|----------|---------|--------|
| **Active** | 0–2 years | Tigris hot storage | Instant (direct S3 GET) |
| **Warm** | 2–10 years | Tigris (same bucket) | Instant (same API) |
| **Cold** | 10+ years | To be defined | Migration TBD (not implemented) |

At year 10, invoices should be migrated from Tigris to a cold storage solution (e.g., AWS Glacier, tape archive). This is **not yet implemented** — the current system keeps all invoices on Tigris indefinitely.

## Consequences

### Positive
- ✅ **Gapless sequential numbering** — satisfies French CGI art. L. 102 B requirements
- ✅ **Credit notes share the sequence** — a credit note is a correction, not a new document series
- ✅ **Database-level uniqueness guarantee** — `@@unique([fiscalYear, sequence])` prevents duplicate numbers
- ✅ **On-the-fly re-rendering fallback** — PDFs are always retrievable even if storage is unavailable
- ✅ **Promise-chain lock is lightweight** — no distributed locking infrastructure needed for single-primary LiteFS
- ✅ **Optional transaction composition** — `generateInvoiceNumber()` accepts a `tx` parameter, allowing the number generation to be composed within a larger transaction (e.g., creating the invoice record atomically with the number)
- ✅ **S3-compatible storage** — Tigris is vendor-agnostic; migration to any S3-compatible provider requires only changing environment variables

### Negative
- ⚠️ **Single-process lock ceiling** — the Promise-chain lock works for a single LiteFS primary but would need replacement with a distributed lock if the application scales to multiple write processes
- ⚠️ **Sequence per fiscal year** — if invoice volume exceeds 99,999 per year, the 5-digit sequence overflows. Currently not a practical concern (<100 invoices/day)
- ⚠️ **No PDF/A compliance** — `@react-pdf/renderer` does not support PDF/A output. Required for official French archiving (NF Z42-026). This is deferred to a future ADR
- ⚠️ **Cold storage migration not implemented** — invoices past 10 years stay on Tigris indefinitely until the migration path is built

### Neutral
- 📝 **F-prefix is cosmetic** — the `F` prefix makes invoice numbers human-readable but adds no functional value. Programmatic lookup uses the `{fiscalYear, sequence}` composite, not the formatted string
- 📝 **ViDA e-invoicing readiness** — the EU's ViDA (VAT in the Digital Age) mandate will require structured e-invoices (EN 16931 format). The current PDF-based approach may need augmentation with XML e-invoice generation. This is future work

## Alternatives Considered

### Alternative 1: Timestamp-based numbering (e.g., `20250521-143022-001`)
- Human-readable, no sequence management needed
- **Rejected**: Does not guarantee gapless sequential numbering. French tax law requires sequential, not chronological.

### Alternative 2: Separate credit note series (e.g., `F2025-00001` for invoices, `AV2025-00001` for credit notes)
- Clearer document type identification
- **Rejected**: CGI art. L. 102 B requires a single gapless sequence for all invoice documents. Credit notes are corrections, not a new series.

### Alternative 3: UUID-based invoice identifiers
- No concurrency concerns, universally unique
- **Rejected**: Not gapless or sequential. Fails French regulatory requirements. Also not human-readable for customer communication.

### Alternative 4: Database auto-increment
- Simplest implementation — let the DB handle it
- **Rejected**: SQLite `AUTOINCREMENT` does not reset per fiscal year. We need `(fiscalYear, sequence)` pairs, not a global increment. Also, Prisma's typed SQL does not expose SQLite's `last_insert_rowid()` reliably.

### Alternative 5: BLOB storage of PDFs in SQLite
- No external storage dependency, simpler deployment
- **Rejected**: Bloats the SQLite database file (PDFs are 50–100 KB each). LiteFS replication would replay these on every failover, increasing replication lag and LTX file size. External object storage keeps the database lean.

### Alternative 6: PDF/A conversion at generation time
- Future-proof for French archiving standards (NF Z42-026)
- **Deferred**: `@react-pdf/renderer` does not support PDF/A. This would require a post-generation conversion step (e.g., Ghostscript, LibreOffice headless) which adds build complexity. Revisit when regulatory pressure materializes.

## Related Decisions
- ADR 001: Price Storage as Integer Cents (invoice amounts use the same integer-cents convention)
- ADR 002: Store-Level Currency Configuration (invoice currency derivation)
- ADR 005: SQLite Scaling Cliff (LiteFS single-primary model is what makes the Promise-chain lock sufficient)

## References
- [French CGI art. L. 102 B](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041468360/) — invoice numbering requirements
- [French Code de commerce art. L. 123-22](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006222344/) — 10-year document retention
- [ViDA (VAT in the Digital Age)](https://taxation-customs.ec.europa.eu/vida_en) — upcoming EU e-invoicing mandate
- [@react-pdf/renderer v4](https://react-pdf.org/) — PDF generation library
- [Tigris Object Storage](https://www.tigrisdata.com/docs/objects/) — S3-compatible storage on Fly.io
- PR #104: PDF invoice generation (squash-merged, `8eb6ea5`)
- PR #196: Credit note flow (merged to `mnlamart/shop`)
- Implementation: `app/utils/invoice-numbering.server.ts`, `app/utils/invoice.server.ts`, `app/utils/invoice-pdf.server.tsx`, `app/utils/storage.server.ts`
- Schema: `prisma/schema.prisma` (Invoice model)
