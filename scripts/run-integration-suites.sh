#!/usr/bin/env sh
set -eu
node scripts/test-category-migration.mjs
node scripts/integration.mjs
node scripts/test-import.mjs
node scripts/test-book-scale.mjs
