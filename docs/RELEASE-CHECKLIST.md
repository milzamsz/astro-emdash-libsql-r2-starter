# Release Checklist

## Code

- [ ] `pnpm test`
- [ ] `pnpm run type-check`
- [ ] `pnpm run build`
- [ ] `pnpm run verify:template`
- [ ] `pnpm run test:docker`
- [ ] `pnpm run test:libsql`
- [ ] `pnpm run test:parity`
- [ ] `pnpm run format:check`
- [ ] `pnpm test` asserts EmDash `0.38.0` in `tests/dependency-pins.test.ts`
- [ ] No secrets/DBs in Git diff
- [ ] Independent review complete

## Data

- [ ] Manual native libSQL backup
- [ ] Restore drill current
- [ ] Migration twice successfully (`pnpm run test:libsql` asserts the second run)
- [ ] `_emdash_migrations` head is `077_plugin_storage_revisions`
- [ ] Parity reviewed
- [ ] Rollback archive/checksum retained

## Deployment

- [ ] Immutable tag points to reviewed commit
- [ ] Exactly two Dokploy services
- [ ] Only one deploy trigger
- [ ] App has no data volume
- [ ] libSQL has no public port
- [ ] Root-only runtime secret mount
- [ ] Domain, canonical URL, stored EmDash URL agree
- [ ] Compression active

## UAT

- [ ] Public routes 200
- [ ] Admin login
- [ ] Authenticated edit/publish
- [ ] Relative internal href saves
- [ ] Image and video uploads reach R2
- [ ] Thumbnails avoid original flood
- [ ] Redeploy preserves content
- [ ] Logs clean
