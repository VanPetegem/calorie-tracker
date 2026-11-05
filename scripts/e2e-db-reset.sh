#!/usr/bin/env bash
# Prepares the local Worker for an e2e run: a fresh, migrated D1 database under .wrangler/e2e, and the
# BETTER_AUTH_SECRET that `wrangler dev` reads from the gitignored .dev.vars. The secret value is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! grep -q '^BETTER_AUTH_SECRET=.' .dev.vars 2>/dev/null; then
	if [ -n "${CI:-}" ]; then
		printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> .dev.vars
	elif grep -q '^BETTER_AUTH_SECRET=.' .env 2>/dev/null; then
		grep '^BETTER_AUTH_SECRET=' .env >> .dev.vars
	else
		echo 'BETTER_AUTH_SECRET is missing: set it in .env (openssl rand -base64 32).' >&2
		exit 1
	fi
fi

rm -rf .wrangler/e2e
pnpm wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e
