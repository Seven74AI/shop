#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_998a22b4
REPORT=/tmp/ci-results-t998a22b4.json

echo "=== VITEST ==="
if npx vitest run --reporter=json 2>/tmp/vitest-err.txt > /tmp/vitest-out.txt; then
  VITEST="PASS"
  VITEST_DETAIL=$(python3 -c "
import json
with open('/tmp/vitest-out.txt') as f:
    d=json.load(f)
print(f\"{d.get('numPassedTests',0)}/{d.get('numTotalTests',0)} pass\")
" 2>/dev/null || echo "?/?")
else
  VITEST="FAIL"
  VITEST_DETAIL="$(tail -20 /tmp/vitest-err.txt)"
fi
echo "vitest: $VITEST ($VITEST_DETAIL)"

echo "=== TSC ==="
if npx tsc --noEmit 2>/tmp/tsc-err.txt; then
  TSC="PASS"
  TSC_ERRORS=0
else
  TSC="FAIL"
  TSC_ERRORS=$(grep -c "error TS" /tmp/tsc-err.txt || echo 0)
fi
echo "tsc: $TSC ($TSC_ERRORS errors)"

echo "=== LINT ==="
if npx eslint app/ 2>/tmp/lint-err.txt; then
  LINT="PASS"
  LINT_ERRORS=0
else
  LINT="FAIL"
  LINT_ERRORS=$(grep -c " error " /tmp/lint-err.txt || echo 0)
fi
echo "lint: $LINT ($LINT_ERRORS errors)"

echo "=== PLAYWRIGHT ==="
if npx playwright test --workers=1 2>/tmp/pw-err.txt; then
  PW="PASS"
  PW_DETAIL="$(grep -oP '\d+ passed' /tmp/pw-err.txt | tail -1 || echo '?')"
else
  PW="FAIL"
  PW_DETAIL="$(tail -5 /tmp/pw-err.txt)"
fi
echo "playwright: $PW ($PW_DETAIL)"

python3 -c "
import json
result = {
    'vitest': '$VITEST',
    'vitest_detail': '$VITEST_DETAIL',
    'tsc': '$TSC',
    'tsc_errors': $TSC_ERRORS,
    'lint': '$LINT',
    'lint_errors': $LINT_ERRORS,
    'playwright': '$PW',
    'playwright_detail': '$PW_DETAIL',
}
with open('$REPORT', 'w') as f:
    json.dump(result, f, indent=2)
print('Report written to $REPORT')
"
