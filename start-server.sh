#!/usr/bin/env bash
cd /tmp/shop-original
set -a
source /tmp/shop-original/.env
set +a
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
export NODE_ENV=production
export MOCKS=true
exec node /tmp/shop-original/server-build/index.js
