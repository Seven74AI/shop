#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_bbce3b35
export MOCKS=true
export CI=true

echo "=== LINT ==="
npx eslint --max-warnings 1000 . 2>&1 | tail -5
echo "EXIT_LINT=${PIPESTATUS[0]}"

echo "=== TSC ==="
npx tsc --noEmit 2>&1 | tail -10
echo "EXIT_TSC=${PIPESTATUS[0]}"

echo "=== VITEST ==="
npx vitest run --reporter=verbose 2>&1 | tail -30
echo "EXIT_VITEST=${PIPESTATUS[0]}"

echo "=== DONE ==="
