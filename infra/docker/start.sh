#!/bin/sh
# Starts one service from the shared image without needing pnpm at runtime.
set -e
case "$APP" in
  api) cd /repo/apps/api && exec ./node_modules/.bin/tsx src/server.ts ;;
  seed) cd /repo/apps/api && exec ./node_modules/.bin/tsx src/seed.ts ;;
  # demo hosts: seed once (skipped when already seeded), then serve
  demo) cd /repo/apps/api && exec ./node_modules/.bin/tsx src/demo.ts ;;
  workers) cd /repo/apps/workers && exec ./node_modules/.bin/tsx src/main.ts ;;
  rooms) cd /repo/apps/rooms && exec ./node_modules/.bin/tsx src/main.ts ;;
  *) echo "unknown APP=$APP (api | seed | demo | workers | rooms)" >&2; exit 1 ;;
esac
