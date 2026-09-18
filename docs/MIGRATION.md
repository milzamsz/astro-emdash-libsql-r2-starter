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

## EmDash 0.34.0 → 0.38.0 upgrade

Core migrations added by this jump: `072_media_folders`, `073_media_focal_point`,
`074_content_deleted_scheduled_index`, `075_entry_edit_locks`,
`076_collection_nav_group`, `077_plugin_storage_revisions`.

Runtime migration mode stays `auto`, so the app applies them on first boot.
`075_entry_edit_locks` creates the new `_emdash_entry_locks` table and
`077_plugin_storage_revisions` adds a `revision` column (default `'0'`) to the
`options` and `_plugin_storage` tables. Neither is backfilled, and 077 guards
itself with a column-existence check so a repeated run is a no-op.

Before deploying to a live site:

1. Take a native libSQL backup and record its id.
2. Freeze editor writes.
3. Deploy the new image; watch the boot logs for migration errors.
4. Verify: `SELECT name FROM _emdash_migrations ORDER BY name` includes `077_plugin_storage_revisions`,
   and `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='_emdash_entry_locks'` returns `1`.
5. Restart the app once and confirm the migration count is unchanged (idempotent second run).
6. Unfreeze writes.

Behaviour change to brief editors on: an entry open in the admin is now locked for
7 minutes. CLI, REST, and MCP writes to that entry return `409 ENTRY_LOCKED` until
the lock is released or the caller passes `--override-lock` / `"overrideLock": true`.

Rollback: restore the backup taken in step 1 and redeploy the previous immutable tag.
Do not reverse-migrate in place while writes continue.
