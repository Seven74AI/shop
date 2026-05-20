#!/bin/bash
# ci-loop.sh — Run full CI for Circuit Breaker Part 2
set -euo pipefail

echo "=== CI START ==="
echo ""

# Layer 1: Unit tests
echo "--- vitest (circuit breaker) ---"
pnpm vitest run --config vitest.circuit-breaker.config.ts 2>&1 | tail -20
VITEST_CB_EXIT=${PIPESTATUS[0]}

echo ""
echo "--- vitest (full suite) ---"
pnpm vitest run 2>&1 | tail -20
VITEST_EXIT=${PIPESTATUS[0]}

# Layer 2: Type checking
echo ""
echo "--- tsc ---"
pnpm tsc --noEmit 2>&1 | tail -30
TSC_EXIT=${PIPESTATUS[0]}

# Layer 3: Lint
echo ""
echo "--- lint ---"
pnpm lint 2>&1 | tail -20
LINT_EXIT=${PIPESTATUS[0]}

# Layer 4: E2E
echo ""
echo "--- playwright ---"
npx playwright test --workers=1 2>&1 | tail -30
PW_EXIT=${PIPESTATUS[0]}

echo ""
echo "=== RESULTS ==="
echo "vitest (cb): $([ $VITEST_CB_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "vitest:      $([ $VITEST_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "tsc:         $([ $TSC_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "lint:        $([ $LINT_EXIT -eq 0 ] && echo PASS || echo FAIL)"
echo "playwright:  $([ $PW_EXIT -eq 0 ] && echo PASS || echo FAIL)"

# Exit non-zero if anything failed
[ $VITEST_CB_EXIT -eq 0 ] && [ $VITEST_EXIT -eq 0 ] && [ $TSC_EXIT -eq 0 ] && [ $LINT_EXIT -eq 0 ] && [ $PW_EXIT -eq 0 ]
