# SQLite to Native libSQL Migration

## Rules

- Freeze editor writes.
- Never mutate the only source copy.
- Never replace a live libSQL file while server runs.
- Never print auth tokens or content containing secrets/PII.

## Source evidence

1. Archive SQLite plus WAL/SHM consistently.
2. Calculate SHA-256.
3. Require `PRAGMA integrity_check = ok`.
4. Inventory tables/row counts.
5. Export EmDash logical seed as secondary recovery.
6. Record freeze timestamp/owner.

## Target sequence

1. Provision private native libSQL primary.
2. Stop it before physical import.
3. Import a tested copy using version-specific procedure.
4. Start and prove authenticated query.
5. Run tracked idempotent migrations.
6. Rebuild derived indexes when supported.
7. Start app on internal libSQL URL.

A logical seed does not contain every operational table. Explicitly account for drafts, revisions, users/auth, options, settings, menus, redirects, media metadata, usage indexes, relationships, and plugin state.

## Parity

```bash
LIBSQL_URL=... LIBSQL_AUTH_TOKEN=... pnpm run audit:parity -- /path/source.db
```

The audit compares tables, columns/types/defaults, indexes, foreign keys, row counts, and deterministic per-table content SHA-256 digests. Review expected derived/runtime differences; unexplained differences block cutover.

## Idempotency

Run migrations twice. Second run must create no duplicates or unintended updates.

## Rollback

Keep source SQLite read-only and checksummed outside app server. Record old DNS/app IDs. Restore routing to old app if needed; do not improvise reverse migration while writes continue.
