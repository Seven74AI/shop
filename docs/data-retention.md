# Data Retention Policy

## Overview

This document describes how user data is handled when an account is deleted, with a focus on order retention for legal compliance.

## Order Retention

### Policy

Orders are **retained** when a user deletes their account. The `userId` field on the `Order` record is set to `NULL` (anonymised), but the order itself — including shipping address snapshots, contact email, payment references, and item details — is preserved.

### Legal Basis

**French tax law (CGI art. L. 102 B)** requires all sales documents to be retained for **6 years** from the date of the transaction. This applies regardless of whether the customer's account still exists.

Orders serve as:
- Sales invoices / proof of transaction
- Tax audit records (VAT, revenue reporting)
- Payment dispute resolution (chargebacks, refunds)

### Technical Implementation

In `prisma/schema.prisma`, the `Order.user` relation uses `onDelete: SetNull`:

```prisma
model Order {
  // ...
  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
  // ...
}
```

This means:
- When a `User` is deleted, the database sets `Order.userId` to `NULL`
- The order record is NOT cascade-deleted
- The order's `email`, `shippingName`, `shippingStreet`, `shippingCity`, etc. remain intact

See `prisma/schema.prisma` lines ~505-512 for the inline documentation.

### What Gets Deleted

When a user deletes their account, the following data is **permanently removed** (cascade delete):

| Entity | Reason |
|--------|--------|
| Password | No longer needed |
| Sessions | No longer valid |
| Connections | OAuth provider links removed |
| Passkeys | WebAuthn credentials removed |
| Addresses | Personal shipping/billing addresses |
| Cart | Shopping cart contents |
| Notes | User-created notes |
| NoteImages | Note attachments |
| UserImage | Profile photo |
| Roles | User-role assignments |

### What Is Retained (Anonymised)

| Entity | Retention | Reason |
|--------|-----------|--------|
| Orders | 6 years | French tax law compliance |
| OrderItems | 6 years (via Order cascade) | Part of order record |
| Stripe references | 6 years | Payment audit trail |

### Customer Rights

After account deletion:
- Orders become **anonymised** — `userId` is set to null, breaking the link to personal identity
- The customer **cannot** access their order history through the app
- The customer **can** request full anonymisation of shipping/personal details in orders **after** the 6-year retention period expires
- During the 6-year period, anonymised orders are only accessible by administrators for legal/audit purposes

## Related Documents

- `prisma/schema.prisma` — Schema definition with inline order retention comments
- `docs/decisions/` — Architecture Decision Records
- `app/routes/account+/privacy.tsx` — Account deletion UI (Privacy & Data page)

## Future Work

- Automated 6-year anonymisation cron job (separate issue)
- GDPR data export (currently available via `/resources/download-user-data`)
- Admin audit log for deleted-account order access
