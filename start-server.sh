#!/bin/bash
set -a
source /tmp/shop-original/.env
set +a
export NODE_ENV=production
export MOCKS=true
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
exec node /tmp/shop-original/server-build/index.js
