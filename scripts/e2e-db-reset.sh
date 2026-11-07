#!/usr/bin/env bash
# Prepares the local Worker for an e2e run: a fresh, migrated D1 database under .wrangler/e2e, and the
# BETTER_AUTH_SECRET and OFF_CONTACT_EMAIL that `wrangler dev` reads from the gitignored .dev.vars. The secret
# value is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

# Matches a non empty value, quoted or not: the empty BETTER_AUTH_SECRET="" from .env.example does not count.
has_secret='^BETTER_AUTH_SECRET=["'"'"']?[^"'"'"'[:space:]]'
if ! grep -Eq "$has_secret" .dev.vars 2>/dev/null; then
	if grep -Eq "$has_secret" .env 2>/dev/null; then
		grep '^BETTER_AUTH_SECRET=' .env >> .dev.vars
	else
		# No .env (CI, or a fresh worktree): the e2e database is thrown away, so a random secret will do.
		printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> .dev.vars
	fi
fi

# Fixed value: e2e never reaches Open Food Facts (playwright.config.ts points the Worker at e2e/off-stub.mjs).
grep -q '^OFF_CONTACT_EMAIL=' .dev.vars 2>/dev/null || echo 'OFF_CONTACT_EMAIL=e2e@example.invalid' >> .dev.vars

rm -rf .wrangler/e2e
pnpm wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e

# drizzle/0001_single_account.sql is hand written. SQLite drops a table's triggers when drizzle-kit rebuilds the
# table, so fail here if the single account backstop is gone. This must run before any server holds the database:
# a second connection to the live file makes D1 fail with SQLITE_BUSY.
trigger=$(pnpm --silent wrangler d1 execute DB --local --persist-to .wrangler/e2e --json \
	--command "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'user_single_account'")
if ! grep -q 'user_single_account' <<<"$trigger"; then
	echo 'The user_single_account trigger is missing after migrations. Re-create it in the migration that rebuilt the user table.' >&2
	exit 1
fi

# Batches the log e2e tests use. Also before any server holds the database.
pnpm --silent wrangler d1 execute DB --local --persist-to .wrangler/e2e --file e2e/seed.sql >/dev/null
