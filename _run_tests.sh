#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_998a22b4

echo "=== VITEST ==="
npx vitest run --reporter=verbose 2>&1 | tail -30
VITEST_EXIT=${PIPESTATUS[0]}

echo ""
echo "=== TSC ==="
npx tsc --noEmit 2>&1 | tail -20
TSC_EXIT=${PIPESTATUS[0]}

echo ""
echo "=== LINT ==="
npx eslint app/utils/order.server.ts app/utils/return-queries.server.ts app/routes/admin+/returns+/'$returnId'.tsx 2>&1 | tail -20
LINT_EXIT=${PIPESTATUS[0]}

echo ""
echo "=== SUMMARY ==="
echo "vitest exit: $VITEST_EXIT"
echo "tsc exit: $TSC_EXIT"
echo "lint exit: $LINT_EXIT"

if [ "$VITEST_EXIT" = "0" ] && [ "$TSC_EXIT" = "0" ] && [ "$LINT_EXIT" = "0" ]; then
  echo "ALL_PASS=true"
else
  echo "ALL_PASS=false"
fi
