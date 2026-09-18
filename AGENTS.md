# AGENTS.md

Instructions for coding agents working in this starter or a derived project.

## Read first

1. `AGENTS.md`
2. `README.md`
3. `docs/DOKPLOY.md`
4. `docs/MIGRATION.md`
5. `docs/OPERATIONS.md`
6. `docs/RELEASE-CHECKLIST.md`

Repository and live execution evidence override memory.

## Fixed production architecture

Exactly two Dokploy services:

1. Stateless Astro + EmDash Application.
2. Private native Dokploy libSQL primary.

Cloudflare R2 is external object storage, not a Dokploy service. Do not introduce Compose, PostgreSQL, Redis, embedded replica, public DB port, or app data volume without an approved architecture change.

## Supported versions

- Node 24 LTS.
- pnpm 10.34.5 via Corepack.
- Astro 7.
- EmDash 0.38.0. Upgrading requires a libSQL backup and a migration run: 0.35.0–0.38.0 add core migrations `072_media_folders` … `077_plugin_storage_revisions`.
- SQLite runs on Node's built-in `node:sqlite`. Do not add `better-sqlite3`; the Docker build fails closed if it reappears.
- Pin native libSQL image; never production `latest`.

## Local vs production

Local:

- `DB_DRIVER=sqlite`
- `DATABASE_URL=file:./data/emdash.db`
- uploads under `data/uploads`

Production:

- `DB_DRIVER=libsql`
- internal `LIBSQL_URL`
- libSQL/R2 credentials from mounted secret file
- no `/app/data` mount
- Node runtime UID/GID 10001 after root-only secret bootstrap

Production behavior must not depend on ignored `.env`, SQLite, developer node_modules mutations, or untracked CMS state.

## Secrets

Never print, commit, pass as Docker build args, or put real values in Dokploy project interpolation strings. Real secrets live at a root-only host path mounted to `/run/secrets/app.env`.

- `dokploy.env.example`: non-secret values only.
- `runtime-secrets.env.example`: placeholders/key inventory only.

Any credential exposed in logs/tool arguments must be rotated.

## Database changes

Every model/data change requires:

- tracked seed/manifest;
- idempotent migration;
- first-run and second-run test;
- native libSQL backup before live mutation;
- parameterized SQL;
- deliberate treatment of current content and revisions;
- upgrade/rollback note;
- live read-back verification.

Never copy a SQLite file into a running libSQL primary. Stop writes/service or use a supported logical migration.

## Media changes

R2 is authoritative. The app proxy streams objects and may generate thumbnails; it is not persistent storage.

Before deleting media metadata/object:

1. Back up libSQL.
2. Verify R2 key state.
3. Verify usage count.
4. Delete only confirmed unused/orphaned data.
5. Re-run public and admin checks.

Relative internal links use `string`, not EmDash `url` fields.

## Generated-package patches

Avoid patching node_modules. If upstream forces it:

- patch source and active dist layouts;
- make it idempotent;
- fail loudly on pattern drift;
- add a clean-image verifier;
- verify the deployed bundle;
- document why and the version boundary.

## Deployment discipline

- Deploy immutable tags.
- Keep `autoDeploy=false` for manual release workflow.
- Trigger one deployment only.
- Never combine tag auto-deploy and manual Deploy.
- Do not remove rollback resources before UAT and restore gates.
- Never expose libSQL publicly.

## Required verification

```bash
pnpm test
pnpm run type-check
pnpm run build
pnpm run verify:template
pnpm run test:docker
pnpm run test:libsql
pnpm run test:parity
```

Production verification also requires:

- app and libSQL `1/1`;
- health endpoint 200;
- public routes and admin login;
- authenticated content edit/publish;
- image and video signed browser uploads to R2 with CORS validation, followed by cleanup;
- no app data mount;
- libSQL backup/restore evidence;
- clean runtime logs.

A successful mutation call is not acceptance; read external state back.

## Git rules

- Small, reviewable changes.
- Never commit real env files, DBs, backups, or credentials.
- Do not commit/push unless requested.
- No history rewrite without approval.
- Use independent review for multi-file implementation.

## Troubleshooting order

1. Reproduce exact failing request.
2. Dokploy domain/router.
3. App env and mounted secret.
4. Runtime descriptor in final image.
5. Authenticated libSQL query/schema.
6. EmDash persisted options/schema.
7. R2 object/upload path.
8. Browser CSP/CORS/network.
9. Cache/in-memory state.

Find the failing boundary before applying a fix.
