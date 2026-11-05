#!/usr/bin/env sh
set -eu
node scripts/test-database.mjs
node scripts/integration.mjs
node scripts/test-import.mjs
if [ "${YU_TEST_SCALE:-false}" = true ]; then node scripts/test-book-scale.mjs; fi
