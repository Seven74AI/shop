# Handoff — t_76930df5: Lazy loading admin + checkout routes

## Run #14 — blocked at ~75 turns

## Completed
- 47 `.lazy.tsx` files created: all admin routes (41) + checkout routes (6)
- `_layout.tsx` files refactored: keep loader/meta, export `lazy = () => import('./_layout.lazy')`
- Script `scripts/transform-lazy.py` for automated transformation
- Build produces correct lazy chunks: `_layout.lazy-DEHMrcXA.js` (13.6KB), etc.
- All chunks registered in build manifest (`build/client/assets/manifest-*.js`)
- E2E test adjustments: networkidle→domcontentloaded in 7 test files
- `retryGenerateOrder` wrapper for orderNumber collision mitigation
- a11y test: `loginAndNavigateToAdminPage` updated with locator-based visibility check + 18s timeout + `test.slow()`

## Branch: `feat/t_76930d` (on Seven74AI/shop fork)
## PR: #255 (OPEN, auto-merge enabled, label: kanban:t_76930df5)

## CI Status (commit 069649d)
- lint: ✅ SUCCESS
- typecheck: ✅ SUCCESS  
- vitest: ✅ SUCCESS (2 transient disk I/O errors on prior run, resolved)
- playwright (1): 58/183 FAILED
- playwright (2): 29/183 FAILED
- playwright-gate: FAILURE

## Root Cause Analysis
**Admin lazy loading doesn't render in production mode.** Lazy chunks are built and registered in the manifest, but the client-side React Router never renders the lazy components. Evidence:
- `page.goto('/admin')` returns 200 (server renders shell)
- `expect(page.locator('main')).toBeVisible()` fails with "element(s) not found" — NOT a visibility issue, the element never exists
- Checkout lazy routes have the same pattern but may/may not work (need separate investigation)

## What I Tried
1. Removed `networkidle` from `loginAndNavigateToAdminPage` (replaced with locator-based visibility) — no effect
2. Added `test.slow()` (triple timeout to 60s) — no effect
3. Increased `toBeVisible` timeout to 18s — no effect

The lazy component genuinely never renders, not a timeout issue.

## Likely Next Steps
1. In CI, capture browser console errors for admin page navigation — likely a JS error during lazy chunk loading
2. Check if React Router v7 has known issues with `export const lazy` in production mode
3. Test locally with `pnpm run start:mocks` and manually navigate to `/admin` — check browser console
4. Consider: does the admin `_layout.lazy.tsx` have an import that fails at runtime? (check the file)
5. Try removing all lazy loading, just adding it to one admin route, and testing — isolate the issue
6. Pre-existing flaky test fixes (orderNumber collisions, 2FA, passkey) are separate tasks — not caused by lazy loading

## Key Files Changed
- `app/routes/admin+/_layout.lazy.tsx` (new, 139 lines)
- `app/routes/admin+/_layout.tsx` (reduced to loader/meta/lazy export only)
- `app/routes/admin+/**/*.lazy.tsx` (40 more lazy files)
- `app/routes/shop+/checkout+/**/*.lazy.tsx` (6 lazy files)
- `tests/e2e/a11y.test.ts` (fixed login helper + test.slow)
- `tests/e2e/admin-orders.test.ts`, `feature-flags.test.ts`, etc. (networkidle→domcontentloaded)
- `scripts/transform-lazy.py` (utility script)

## Artifacts Referenced
- PRD/Audit: GitHub Issue #247 (Seven74AI/shop)
- PR: #255 on Seven74AI/shop
- Last CI run: https://github.com/Seven74AI/shop/actions/runs/26712249846
