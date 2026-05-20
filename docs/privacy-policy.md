# Privacy Policy

## Overview

This document describes what personal data the Shop application collects, how it is used, stored, and shared, and what rights you have regarding your data under the General Data Protection Regulation (GDPR) and applicable French data protection law (Loi Informatique et Libertés).

**Last updated:** [date to be filled on publication]

## Data Controller

The Shop application is operated by **[Company Name]** (referred to as "we", "us", or "our" throughout this document).

For questions about this policy or to exercise your data rights, contact us at: **[privacy@example.com]**

## What Data We Collect

### Account Data

When you create an account, we collect:

| Field | Purpose | Legal Basis |
|---|--|---|---|
| Email address | Account identification, login, order confirmations, service communications | Contractual necessity |
| Username | Public profile identifier | Contractual necessity |
| Name (optional) | Display name on your profile | Legitimate interest (personalisation) |
| Password (hashed) | Account security | Contractual necessity |
| Profile image (optional) | Profile personalisation | Consent |

### Authentication & Session Data

| Data | Purpose | Retention |
|---|---|---|
| Session tokens | Keep you logged in across visits | Duration of session + 30 days (remember-me) |
| OAuth connections (GitHub) | Third-party login provider reference | Until account deletion |
| Passkeys (WebAuthn) | Passwordless authentication | Until removed by user or account deletion |

### Address Data

You may store shipping and billing addresses. Each address includes: full name, street, city, state/province (optional), postal code, country (ISO code), and an optional label (e.g., "Home", "Work").

- **Purpose:** Order fulfilment and shipping
- **Legal basis:** Contractual necessity for orders; consent for address book storage
- **Retention:** Until account deletion (cascade-deleted)

### Order Data

When you place an order, we collect and store:

| Data | Purpose |
|---|---|
| Order items and quantities | Transaction record, fulfilment |
| Price snapshots (subtotal, total, shipping cost) | Financial record, tax compliance |
| Shipping name, street, city, state, postal code, country | Delivery |
| Contact email | Order confirmation, delivery updates |
| VAT breakdown (tax kind, rate, amounts) | Tax compliance |
| Customer VAT number (optional) | B2B reverse-charge |
| Stripe payment references (Checkout Session ID, PaymentIntent ID, Charge ID) | Payment processing, audit trail |
| Shipping method and carrier details | Fulfilment tracking |
| Mondial Relay pickup point (if applicable) | Delivery to pickup point |

- **Legal basis:**
  - Contractual necessity (fulfilling your order)
  - Legal obligation — French tax law (CGI art. L. 102 B) requires 6-year retention of all sales documents
- **Retention:** 6 years from transaction date, then full anonymisation available on request (see [Data Retention Policy](./data-retention.md))

### Cart Data

Items you add to your cart before checkout. Cart contents are stored until checkout, account deletion, or expiry.

- **Purpose:** Shopping cart functionality
- **Legal basis:** Contractual necessity (pre-contractual steps)

### Notes

User-created notes with optional image attachments.

- **Purpose:** User-generated content
- **Legal basis:** Consent (you choose to create notes)
- **Retention:** Until account deletion (cascade-deleted)

### Notification Preferences

We store your preferences for:

- Email notifications (on/off)
- Order update emails (on/off)
- Marketing emails (on/off, **default: off**)

All marketing communications are opt-in by default.

## How We Use Your Data

We use your personal data for the following purposes:

1. **Account management** — creating, maintaining, and securing your account
2. **Order processing** — fulfilling purchases, processing payments via Stripe, shipping products
3. **Legal compliance** — tax reporting, audit trails, legal obligations under French and EU law
4. **Service communication** — order confirmations, shipping updates, account security notices
5. **Customer support** — responding to inquiries about orders or accounts
6. **Platform improvement** — analysing aggregated, anonymised usage patterns

We do **not**:
- Sell your personal data to third parties
- Use your data for automated decision-making (including profiling) that produces legal effects
- Send marketing emails unless you explicitly opt in

## Data Sharing & Third-Party Services

### Payment Processing — Stripe

We use **Stripe** to process payments. When you check out, Stripe collects your payment method details directly — we never store your credit card information on our servers.

- Stripe's privacy policy: [https://stripe.com/privacy](https://stripe.com/privacy)
- Data shared: order amount, currency, order reference ID, email (for receipts)

### Authentication — GitHub OAuth

If you sign in with GitHub, GitHub shares your GitHub user ID and public email with us. We store a reference to your GitHub identity to link it to your account.

- GitHub's privacy policy: [https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)
- Data shared: GitHub user ID, public email address

### Email Delivery — Resend

We use **Resend** to send transactional emails (order confirmations, shipping updates, account verification).

- Resend's privacy policy: [https://resend.com/legal/privacy-policy](https://resend.com/legal/privacy-policy)
- Data shared: email address, email template content

### File Storage — Tigris

Profile images, note images, and product images are stored using **Tigris** (S3-compatible object storage).

- Tigris privacy policy: [https://www.tigrisdata.com/docs/legal/privacy/](https://www.tigrisdata.com/docs/legal/privacy/)
- Data stored: image files, with object keys linked to your account

### Shipping — Mondial Relay (optional)

If you select Mondial Relay as a shipping method, we share your shipping details and selected pickup point with Mondial Relay to generate shipping labels.

## Cookies & Tracking

We use the following types of cookies:

| Cookie Type | Purpose | Duration |
|---|---|---|
| Session cookie | Maintain login state | Session |
| Remember-me cookie | Persistent login across visits | 30 days |
| CSRF token | Security (Cross-Site Request Forgery protection) | Session |
| Honeypot token | Anti-spam protection | Per-form |
| Verification tokens | Email verification, password reset | Limited (minutes to hours) |

We do **not** use:
- Third-party tracking cookies
- Advertising cookies
- Analytics cookies that identify individual users

## Data Retention

### General Retention Periods

| Data Category | Retention Period |
|---|---|
| Account data (email, username, name, profile image, preferences) | Until account deletion |
| Authentication data (password hash, sessions, OAuth connections, passkeys) | Until account deletion or session expiry |
| Addresses | Until account deletion |
| Cart contents | Until checkout, account deletion, or expiry |
| Notes & note images | Until account deletion |
| Orders & order items | 6 years from transaction date (tax law) |
| Email verification tokens | 24 hours |

### Account Deletion

You can delete your account at any time from the **Account → Privacy & Data → Danger Zone** section. When you delete your account:

- **Immediately deleted:** Password, sessions, OAuth connections, passkeys, addresses, cart, notes, note images, profile image, role assignments
- **Anonymised (retained for legal reasons):** Orders — the link to your account is removed (`userId` set to null), but the order record is preserved for the 6-year legal retention period

For full details, see [Data Retention Policy](./data-retention.md).

## Your Rights (GDPR)

Under the GDPR and French data protection law, you have the following rights:

### Right of Access (Art. 15)

You can request a copy of all personal data we hold about you. Use the **Account → Privacy & Data → Download Your Data** feature to export your data in JSON format, including your profile, notes, images, and sessions.

### Right to Rectification (Art. 16)

You can update your profile information at any time via your account settings. Contact us if you need assistance correcting data you cannot edit yourself.

### Right to Erasure — "Right to be Forgotten" (Art. 17)

You can delete your account and all associated personal data via **Account → Privacy & Data → Danger Zone → Delete Your Account**. See [Account Deletion](#account-deletion) above for what is immediately deleted vs. retained for legal compliance.

After the 6-year legal retention period for orders expires, you may request full anonymisation of any remaining personally identifiable information in those order records.

### Right to Data Portability (Art. 20)

Use the **Download Your Data** feature to receive your data in a structured, machine-readable JSON format.

### Right to Object & Restrict Processing (Art. 18, 21)

You may object to or request restriction of processing of your personal data. Contact us at **[privacy@example.com]**.

### Right to Withdraw Consent (Art. 7)

Where processing is based on consent (e.g., marketing emails), you can withdraw consent at any time via your account notification settings.

To exercise any of these rights, contact us at **[privacy@example.com]**. We will respond within one month (extendable by two months for complex requests, with notification).

## Data Security

We implement appropriate technical and organisational measures to protect your personal data:

- Passwords are **hashed** (bcrypt) — never stored in plain text
- Session tokens use cryptographically secure random generation
- CSRF protection on all state-changing requests
- HTTPS for all data in transit
- Database access restricted to server-side code only
- File uploads stored with unique, non-guessable object keys

## International Data Transfers

Our servers are located in **[region/country]**. If you are accessing the service from outside this region, your data will be transferred and processed there. We ensure adequate safeguards for international transfers as required by GDPR Chapter V.

## Children's Privacy

Our service is not directed at children under 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us.

## Changes to This Policy

We may update this policy from time to time. Material changes will be communicated via email or a notice on the site. Continued use of the service after changes constitutes acceptance.

## Related Documents

- [`docs/data-retention.md`](./data-retention.md) — Detailed data retention policy and technical implementation
- `app/routes/account+/privacy.tsx` — Privacy & Data settings page
- `app/routes/resources+/download-user-data.tsx` — Data export endpoint
- `prisma/schema.prisma` — Database schema with inline retention documentation

## Contact

For privacy-related inquiries or to exercise your data rights:

- **Email:** **[privacy@example.com]**
- **Postal mail:** **[Company address]**

For GDPR-specific complaints, you also have the right to lodge a complaint with a supervisory authority, such as the **CNIL** (Commission Nationale de l'Informatique et des Libertés) in France: [https://www.cnil.fr/en](https://www.cnil.fr/en)
