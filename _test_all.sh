#!/bin/bash
# Full CI test suite — runs vitest, tsc, lint, playwright
# Saves results to /tmp/test-all-results.json
set -euo pipefail
cd /root/.hermes/kanban/boards/shop/workspaces/t_91ce4743
REPORT=/tmp/test-all-results.json

echo "=== VITEST ==="
VITEST_PASS=0
VITEST_TOTAL=0
VITEST_FAILED=0
VITEST_OUTPUT=""
if CI=true npx vitest run --reporter=verbose 2>&1 | tee /tmp/vitest-full.txt; then
  VITEST_EXIT=0
else
  VITEST_EXIT=$?
fi
# Parse results from vitest verbose output
if grep -q "Tests " /tmp/vitest-full.txt; then
  VITEST_LINE=$(grep "Tests " /tmp/vitest-full.txt | tail -1)
  VITEST_FAILED=$(echo "$VITEST_LINE" | grep -oP '\d+(?= failed)' || echo "0")
  VITEST_PASS=$(echo "$VITEST_LINE" | grep -oP '\d+(?= passed)' || echo "0")
  VITEST_TOTAL=$((VITEST_FAILED + VITEST_PASS))
fi
# Grab 50 lines of failures
VITEST_FAILURES=$(grep -A2 "FAIL" /tmp/vitest-full.txt | head -80 || echo "(none)")
echo "vitest: exit=$VITEST_EXIT passed=$VITEST_PASS failed=$VITEST_FAILED total=$VITEST_TOTAL"

echo "=== TSC ==="
TSC_EXIT=0
TSC_ERRORS=0
TSC_ERROR_LIST=""
if npx tsc --noEmit 2>&1 | tee /tmp/tsc-full.txt; then
  TSC_EXIT=0
else
  TSC_EXIT=$?
fi
TSC_ERRORS=$(grep -c "error TS" /tmp/tsc-full.txt || echo "0")
TSC_ERROR_LIST=$(grep "error TS" /tmp/tsc-full.txt | head -30 || echo "(none)")
echo "tsc: exit=$TSC_EXIT errors=$TSC_ERRORS"

echo "=== LINT ==="
LINT_EXIT=0
LINT_ERRORS=0
LINT_ERROR_LIST=""
if npx eslint app/ 2>&1 | tee /tmp/lint-full.txt; then
  LINT_EXIT=0
else
  LINT_EXIT=$?
fi
LINT_ERRORS=$(grep -c " error " /tmp/lint-full.txt || echo "0")
warnings=$(grep -c " warning " /tmp/lint-full.txt || echo "0")
LINT_ERROR_LIST=$(grep " error " /tmp/lint-full.txt | head -20 || echo "(none)")
echo "lint: exit=$LINT_EXIT errors=$LINT_ERRORS warnings=$warnings"

echo "=== PLAYWRIGHT ==="
PW_EXIT=0
PW_PASSED=0
PW_FAILED=0
PW_OUTPUT=""
if npx playwright test --workers=1 2>&1 | tee /tmp/pw-full.txt; then
  PW_EXIT=0
else
  PW_EXIT=$?
fi
PW_PASSED=$(grep -oP '\d+(?= passed)' /tmp/pw-full.txt | tail -1 || echo "0")
PW_FAILED=$(grep -oP '\d+(?= failed)' /tmp/pw-full.txt | tail -1 || echo "0")
PW_FAILURES=$(grep -A5 " failed\|Error:" /tmp/pw-full.txt | head -60 || echo "(none)")
echo "playwright: exit=$PW_EXIT passed=$PW_PASSED failed=$PW_FAILED"

echo "=== SUMMARY ==="
python3 -c "
import json
result = {
    'vitest_exit': $VITEST_EXIT,
    'vitest_passed': $VITEST_PASS,
    'vitest_failed': $VITEST_FAILED,
    'vitest_total': $VITEST_TOTAL,
    'tsc_exit': $TSC_EXIT,
    'tsc_errors': int('$TSC_ERRORS'),
    'lint_exit': $LINT_EXIT,
    'lint_errors': int('$LINT_ERRORS'),
    'playwright_exit': $PW_EXIT,
    'playwright_passed': int('$PW_PASSED' or '0'),
    'playwright_failed': int('$PW_FAILED' or '0'),
    'all_pass': ($VITEST_EXIT == 0 and $TSC_EXIT == 0 and int('$LINT_ERRORS') == 0 and $PW_EXIT == 0)
}
with open('$REPORT', 'w') as f:
    json.dump(result, f, indent=2)
print(json.dumps(result, indent=2))
"
echo "Report saved to $REPORT"
