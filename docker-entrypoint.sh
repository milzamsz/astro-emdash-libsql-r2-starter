#!/bin/sh
set -eu
SECRETS_FILE="${APP_SECRETS_FILE:-/run/secrets/app.env}"
if [ -r "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
  set +a
fi

if [ -z "${DB_DRIVER:-}" ]; then
  if [ "${NODE_ENV:-}" = "production" ]; then
    echo "[entrypoint] DB_DRIVER is required in production" >&2
    exit 1
  fi
  DB_DRIVER=sqlite
  export DB_DRIVER
fi

case "$DB_DRIVER" in
  libsql)
    : "${LIBSQL_URL:?LIBSQL_URL is required in libSQL mode}"
    : "${LIBSQL_AUTH_TOKEN:?LIBSQL_AUTH_TOKEN is required in libSQL mode}"
    : "${S3_ENDPOINT:?S3_ENDPOINT is required in production}"
    : "${S3_BUCKET:?S3_BUCKET is required in production}"
    : "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required in production}"
    : "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required in production}"
    : "${EMDASH_ENCRYPTION_KEY:?EMDASH_ENCRYPTION_KEY is required in production}"
    node -e 'if(!/^emdash_enc_v1_[A-Za-z0-9_-]{43}$/.test(process.env.EMDASH_ENCRYPTION_KEY||"")) { console.error("[entrypoint] EMDASH_ENCRYPTION_KEY is malformed or a placeholder"); process.exit(1) }'
    normalized_credentials=$(printf '%s' "$LIBSQL_AUTH_TOKEN:$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" | tr '[:lower:]' '[:upper:]')
    case "$normalized_credentials" in
      *CHANGE_ME*|*CHANGEME*|*REPLACE_ME*|*REPLACEME*|*PLACEHOLDER*|*EXAMPLE*)
        echo "[entrypoint] Placeholder credentials are forbidden" >&2
        exit 1
        ;;
    esac
    unset normalized_credentials
    echo "[entrypoint] libSQL + R2 mode; application filesystem remains stateless"
    ;;
  sqlite)
    if [ "${NODE_ENV:-}" = "production" ]; then
      echo "[entrypoint] SQLite is forbidden in the production image" >&2
      exit 1
    fi
    mkdir -p /app/data /app/data/uploads
    chown -R 10001:10001 /app/data
    echo "[entrypoint] SQLite development/test mode"
    ;;
  *) echo "[entrypoint] Unsupported DB_DRIVER: $DB_DRIVER" >&2; exit 1 ;;
esac

exec setpriv --reuid=10001 --regid=10001 --init-groups node ./dist/server/entry.mjs
