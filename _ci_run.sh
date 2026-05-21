#!/bin/bash
cd /root/.hermes/kanban/boards/shop/workspaces/t_536f085b
export MOCKS=true
export CI=true
RESULTS="/tmp/ci_results_t536f085b.txt"
PASS=0
FAIL=0
> "$RESULTS"

run_step() {
    local name="$1"
    local cmd="$2"
    echo "=== CI: $name ==="
    if eval "$cmd" 2>&1; then
        echo "✅ $name PASS" | tee -a "$RESULTS"
        ((PASS++))
    else
        echo "❌ $name FAIL (exit $?)" | tee -a "$RESULTS"
        ((FAIL++))
    fi
}

run_step "TYPECHECK" "pnpm typecheck"
run_step "VITEST" "pnpm test -- --run"
run_step "LINT" "pnpm lint"
run_step "PLAYWRIGHT" "pnpm test:e2e:run"

echo "=== CI SUMMARY ==="
echo "Pass: $PASS, Fail: $FAIL" | tee -a "$RESULTS"
cat "$RESULTS"
