#!/bin/sh
# One-off: copies the production database from Neon into the Postgres run by Coolify.
# Run it on the server, where Docker's internal network reaches the Coolify Postgres:
#
#   export SOURCE_URL='postgresql://…neon.tech/fala?sslmode=require'  # Neon's DIRECT url (no -pooler)
#   export TARGET_URL='postgres://…@<uuid>:5432/fala'                 # Coolify's "Postgres URL (internal)"
#   sh migrate-from-neon.sh
#
# Stop the web app and the worker in Coolify first, so nothing writes to Neon during the copy.
# It refuses a target that already has tables, and keeps the dump in the current directory.
set -eu

: "${SOURCE_URL:?Set SOURCE_URL to Neon's direct connection string.}"
: "${TARGET_URL:?Set TARGET_URL to the Coolify Postgres internal URL.}"
NETWORK="${NETWORK:-coolify}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
DUMP="neon-$(date -u +%Y%m%dT%H%M%SZ).dump"
export SOURCE_URL TARGET_URL DUMP

# Runs a shell command in a throwaway Postgres client container; the URLs go in as env vars.
pg() {
  docker run --rm --network "$NETWORK" -e SOURCE_URL -e TARGET_URL -e DUMP -e SQL \
    -v "$PWD:/dump" -w /dump "$PG_IMAGE" sh -c "$1"
}

# psql_at SOURCE_URL|TARGET_URL "sql" → unaligned, tuples-only output.
psql_at() {
  SQL="$2" pg "psql \"\$$1\" -v ON_ERROR_STOP=1 -Atc \"\$SQL\""
}

# Exact row count of every table in the public schema, one "table count" per line.
COUNTS="select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
TABLES="select count(*) from information_schema.tables where table_schema = 'public'"

echo "Source: $(psql_at SOURCE_URL 'select version()')"
echo "Target: $(psql_at TARGET_URL 'select version()')"

if [ "$(psql_at TARGET_URL "$TABLES")" != "0" ]; then
  echo "The target database already has tables in its public schema. Point TARGET_URL at a new, empty database." >&2
  exit 1
fi

echo "Dumping Neon to $DUMP..."
pg 'pg_dump --format=custom --no-owner --no-privileges --file="/dump/$DUMP" "$SOURCE_URL"'

echo "Restoring into the target..."
pg 'pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname="$TARGET_URL" "/dump/$DUMP"'

echo "Comparing row counts..."
psql_at SOURCE_URL "$COUNTS" > counts-source.txt
psql_at TARGET_URL "$COUNTS" > counts-target.txt
if diff counts-source.txt counts-target.txt; then
  cat counts-target.txt
  echo "Done: every table has the same number of rows. The dump is in $PWD/$DUMP."
else
  echo "Row counts differ (source on the left). Do not switch the app over." >&2
  exit 1
fi
