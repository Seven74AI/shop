#!/bin/bash
# CI run for cookie-consent feature
# Runs: vitest → tsc → lint → playwright (cookie-consent only)
set -o pipefail

cd /root/.hermes/kanban/boards/shop/workspaces/t_3fc2fdfb

echo "=== CI START ==="
echo ""

# Layer 0: Build
echo "--- BUILD ---"
pnpm build 2>&1 | tail -5
BUILD_EXIT=${PIPESTATUS[0]}
echo "BUILD exit: $BUILD_EXIT"
echo ""

# Layer 1: Unit tests (vitest)
echo "--- VITEST ---"
pnpm vitest run 2>&1 | tail -5
VITEST_EXIT=${PIPESTATUS[0]}
echo "VITEST exit: $VITEST_EXIT"
echo ""

# Layer 2: Type checking
echo "--- TSC ---"
pnpm tsc --noEmit 2>&1 | tail -20
TSC_EXIT=${PIPESTATUS[0]}
echo "TSC exit: $TSC_EXIT"
echo ""

# Layer 3: Lint
echo "--- LINT ---"
pnpm lint 2>&1 | tail -20
LINT_EXIT=${PIPESTATUS[0]}
echo "LINT exit: $LINT_EXIT"
echo ""

# Layer 4: E2E (cookie-consent tests only)
echo "--- PLAYWRIGHT (cookie-consent) ---"
npx playwright test tests/e2e/cookie-consent.test.ts --workers=1 2>&1
PW_EXIT=$?
echo "PLAYWRIGHT exit: $PW_EXIT"
echo ""

echo "=== RESULTS ==="
echo "build:      $([ $BUILD_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "vitest:     $([ $VITEST_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "tsc:        $([ $TSC_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "lint:       $([ $LINT_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "playwright: $([ $PW_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo ""

# Exit non-zero if anything failed
[ $BUILD_EXIT -eq 0 ] && [ $VITEST_EXIT -eq 0 ] && [ $TSC_EXIT -eq 0 ] && [ $LINT_EXIT -eq 0 ] && [ $PW_EXIT -eq 0 ]
