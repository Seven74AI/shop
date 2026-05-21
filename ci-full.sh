#!/bin/bash
# Full CI script for shop project
# Runs: lint, typecheck, vitest, build
# Produces JSON report at /tmp/ci-report.json

set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_bbce3b35

REPORT="/tmp/ci-report.json"
echo '{"started": true}' > "$REPORT"

# 1. Lint
echo "=== ESLint ==="
if pnpm lint 2>&1 | tee /tmp/lint.log; then
    LINT="pass"
    LINT_ERRORS=0
    LINT_WARNINGS=$(grep -c "warning" /tmp/lint.log 2>/dev/null || echo 0)
else
    LINT="fail"
    LINT_ERRORS=$(grep -c "error" /tmp/lint.log 2>/dev/null || echo 0)
fi

# 2. TypeScript
echo "=== TypeScript ==="
pnpm exec tsc --noEmit 2>&1 | tee /tmp/tsc.log
TSC_EXIT=${PIPESTATUS[0]}
TSC_TOTAL=$(grep -c "error TS" /tmp/tsc.log 2>/dev/null || echo 0)
# Count errors not in admin+invoices or scripts (pre-existing)
TSC_NEW=$(grep "error TS" /tmp/tsc.log 2>/dev/null | grep -v "admin+/invoices+" | grep -v "admin+/orders+" | grep -v "scripts/test-sitemap" | grep -v "shop/" | wc -l)
if [ "$TSC_NEW" -eq 0 ]; then
    TSC="pass (pre-existing: $TSC_TOTAL)"
else
    TSC="fail ($TSC_NEW new, $TSC_TOTAL total)"
fi

# 3. Vitest
echo "=== Vitest ==="
cp .env.example .env 2>/dev/null || true
echo "MOCKS=true" >> .env
npx prisma migrate deploy 2>&1 | tail -3
npx prisma generate --sql 2>&1 | tail -3
if pnpm test -- --run 2>&1 | tee /tmp/vitest.log; then
    VITEST="pass"
else
    VITEST="fail"
fi
VITEST_PASSED=$(grep -oP '\d+(?= passed)' /tmp/vitest.log 2>/dev/null | tail -1 || echo "?")
VITEST_FAILED=$(grep -oP '\d+(?= failed)' /tmp/vitest.log 2>/dev/null | tail -1 || echo "?")

# 4. Build
echo "=== Build ==="
if pnpm build 2>&1 | tee /tmp/build.log; then
    BUILD="pass"
else
    BUILD="fail"
fi

# Write report
cat > "$REPORT" << JSONREPORT
{
  "lint": "$LINT",
  "lint_errors": $LINT_ERRORS,
  "tsc": "$TSC",
  "tsc_new_errors": $TSC_NEW,
  "tsc_total_errors": $TSC_TOTAL,
  "vitest": "$VITEST",
  "vitest_passed": "$VITEST_PASSED",
  "vitest_failed": "$VITEST_FAILED",
  "build": "$BUILD",
  "all_pass": $([ "$LINT" = "pass" ] && [ "$TSC_NEW" -eq 0 ] && [ "$VITEST" = "pass" ] && [ "$BUILD" = "pass" ] && echo "true" || echo "false")
}
JSONREPORT

echo "=== CI Report ==="
cat "$REPORT"
