#!/usr/bin/env bash
# Darkroom one-time setup: create the D1 database, wire its id into
# wrangler.toml, create the schema, and deploy. Safe to re-run.
#
#   cd server
#   npm install
#   npm run setup      # (this script)
#
# Requires a free Cloudflare account. The first wrangler command opens a
# browser to log you in.
set -euo pipefail
cd "$(dirname "$0")"

WRANGLER="npx --yes wrangler@3"

echo "▸ Darkroom setup"
echo "  Logging in to Cloudflare (a browser window may open)…"
$WRANGLER whoami >/dev/null 2>&1 || $WRANGLER login

# 1. Create the D1 database (ignore error if it already exists).
echo "▸ Creating D1 database 'darkroom' (skipped if it already exists)…"
CREATE_OUT="$($WRANGLER d1 create darkroom 2>&1 || true)"
echo "$CREATE_OUT" | grep -v '^$' || true

# 2. Discover the database_id (from create output, else from `d1 info`).
DB_ID="$(printf '%s\n' "$CREATE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1 || true)"
if [ -z "$DB_ID" ]; then
  DB_ID="$($WRANGLER d1 info darkroom 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1 || true)"
fi
if [ -z "$DB_ID" ]; then
  echo "✗ Could not determine the D1 database id automatically."
  echo "  Run: npx wrangler d1 info darkroom   then paste the id into wrangler.toml (database_id)."
  exit 1
fi
echo "▸ Using database_id: $DB_ID"

# 3. Write the id into wrangler.toml.
if grep -q 'PUT_YOUR_D1_DATABASE_ID_HERE' wrangler.toml; then
  # portable in-place sed (works on GNU and BSD/macOS)
  sed -i.bak "s/PUT_YOUR_D1_DATABASE_ID_HERE/$DB_ID/" wrangler.toml && rm -f wrangler.toml.bak
  echo "▸ Wrote database_id into wrangler.toml"
else
  echo "▸ wrangler.toml already has a database_id — leaving it as is"
fi

# 4. Create the schema on the remote database.
echo "▸ Creating tables…"
$WRANGLER d1 execute darkroom --remote --file=./schema.sql

# 5. Deploy.
echo "▸ Deploying…"
$WRANGLER deploy

echo ""
echo "✓ Darkroom is live. The URL is printed just above (…workers.dev)."
echo "  Open it, start a roll, and give away your three spots."
