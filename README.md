# Astro + EmDash + libSQL + R2 Starter

Production starter for an Astro SSR website with EmDash CMS, deployed to Dokploy as **exactly two independent services**:

```text
Internet
   |
   v
[1] Astro + EmDash application (stateless)
   |  private Dokploy network
   v
[2] Native Dokploy libSQL primary (persistent)

Cloudflare R2 is external object storage, not a third Dokploy service.
```

This template captures lessons from a real production migration: build-time database descriptors ignoring runtime env, credentials leaking into image layers, duplicate deployments racing with `409 AlreadyExists`, direct browser-to-R2 CORS failures, full-resolution media grids, unversioned CMS schema, and backups never restore-tested.

## Included

- Astro 7 SSR with Node standalone adapter.
- EmDash 0.38.0 and Live Content Collections.
- SQLite for local development on Node's built-in `node:sqlite` (no native addon).
- EmDash core migrations applied automatically at runtime (`migrations.runtime = "auto"`).
- Runtime-resolved libSQL dialect for production; credentials never baked into `dist`.
- The production DB path uses `@libsql/kysely-libsql` (currently 0.4.1, the
  latest) which resolves `@libsql/client` 0.8.1; the smoke scripts query with
  their own `@libsql/client` 0.18.0. Those are separate clients by design.
- R2/S3 descriptor selected during build, credentials resolved at runtime. Browser uploads use signed direct R2 PUTs, so bucket CORS is required.
- Root-only runtime secret file mounted by Dokploy.
- Stateless app container with no `/app/data` production volume.
- Root entrypoint reads mode-600 secrets, then drops to dedicated UID/GID 10001 before Node starts.
- Docker healthcheck at `/api/health`.
- Contract tests, parity audit, Docker runtime smoke, deployment/restore checklists.
- Traefik Brotli/gzip middleware example for the EmDash admin bundle.

## Requirements

- Node.js 24 LTS (≥ 24.19) and Corepack.
- pnpm 10.34.5.
- Docker only for the container gates (`test:docker`, `test:libsql`, `test:parity`).
- Dokploy with native libSQL support.
- Cloudflare R2 bucket and S3 API credentials.
- DNS pointed to the Dokploy server.

## Quick start: local SQLite

```bash
cp .env.example .env.local
corepack enable
pnpm install
pnpm dev
```

Open:

- Site: `http://localhost:4321`
- Admin: `http://localhost:4321/_emdash/admin`
- Health: `http://localhost:4321/api/health`

Local development uses `data/emdash.db` and `data/uploads`; both are ignored by Git. Complete the EmDash setup wizard on first start.

## Production topology

| #   | Dokploy resource                | Public?          | Persistence    |
| --- | ------------------------------- | ---------------- | -------------- |
| 1   | Application: `example-web`      | HTTPS domain     | None           |
| 2   | Native libSQL: `example-libsql` | No external port | Dokploy volume |

R2 remains an external Cloudflare service. Do not create Compose, PostgreSQL, Redis, or a second web app unless requirements explicitly change.

## Deployment summary

1. Create native Dokploy libSQL primary with a pinned image.
2. Initialize/import EmDash under a write freeze.
3. Create stateless Dokploy Application from a pinned Git tag.
4. Put runtime credentials in `/etc/dokploy/secrets/example-web.env` mode `600`.
5. Bind mount it to `/run/secrets/app.env`.
6. Set only non-secret values from `dokploy.env.example`.
7. Attach domain to port `4321`.
8. Attach `config/traefik-compress.yml` as file-provider middleware.
9. Deploy exactly once; keep auto-deploy off for manual immutable-tag releases.
10. Run `docs/RELEASE-CHECKLIST.md` before promotion.

Full runbook: [`docs/DOKPLOY.md`](docs/DOKPLOY.md).

## Environment model

### Non-secret app environment

`dokploy.env.example` contains no credentials and no `${{project.*}}` references.

### Runtime secret file

`runtime-secrets.env.example` is a key inventory only. Store real values on the server:

```bash
install -d -m 700 /etc/dokploy/secrets
install -m 600 runtime-secrets.env /etc/dokploy/secrets/example-web.env
```

Bind mount:

```text
/etc/dokploy/secrets/example-web.env -> /run/secrets/app.env
```

Why: build-server interpolation can fail before Docker build; build args and copied env files may expose secrets in image metadata/layers. `docker-entrypoint.sh` exports mounted values immediately before Node starts.

## Database behavior

`src/lib/database-config.ts` emits a tracked runtime descriptor. `src/emdash/runtime-libsql-dialect.ts` reads libSQL URL/token inside the running container.

This avoids the critical trap where `astro build` serializes SQLite and ignores runtime `DB_DRIVER=libsql`. Production acceptance requires proving the final artifact uses the runtime entrypoint and authenticated `SELECT 1` works over the private network.

See [`docs/MIGRATION.md`](docs/MIGRATION.md).

## Media behavior

R2 is authoritative. A URL like:

```text
/_emdash/api/media/file/<storage-key>
```

is a streaming same-origin proxy—not local persistence. It enables secure headers and Astro thumbnails while the original remains in R2.

For large libraries:

- use the R2 custom domain for public content;
- use same-origin media-list URLs so `/_image` creates 400px WebP previews;
- compress EmDash admin JS at the edge;
- delete a broken media row only when the R2 object is missing and usage is zero, after backup.

## Commands

```bash
pnpm test
pnpm run type-check
pnpm run build
pnpm run verify:template
pnpm run test:docker
pnpm run test:libsql
pnpm run test:parity
LIBSQL_URL=... LIBSQL_AUTH_TOKEN=... pnpm run audit:parity -- source.db
```

## CMS schema and migrations

Never rely on ignored local database state. Every schema/data change needs:

1. A tracked migration set. Runtime migrations are `auto`, so the applied
   set is pinned by the exact `emdash` version in `package.json` and
   `pnpm-lock.yaml`. EmDash writes `.emdash/migrations.json` only when the
   descriptor enables deployment-managed migrations, which this template
   does not, so that generated file is ignored rather than committed.
2. An idempotent persistent-DB migration.
3. A test that runs it twice.
4. A clean-image verifier for generated/admin patches.
5. Upgrade and rollback notes.

Internal relative hrefs such as `/services/example` must be `string`, not `url` fields.

## Releases

```bash
pnpm test
pnpm run type-check
pnpm run build
git tag -a production-YYYYMMDD-v1 -m "Production release"
git push origin production-YYYYMMDD-v1
```

Choose one trigger:

- immutable tag + manual Deploy (`autoDeploy=false`), or
- automatic tag deploy with no manual click.

Never use both. Concurrent builds can race at Swarm service creation.

## Backup policy

- Native libSQL backup daily with explicit retention.
- Manual backup before every live schema/data mutation.
- R2 versioning/lifecycle independent of DB backup.
- Restore into a disposable libSQL service and verify schema, counts, auth, content, and media references.
- Keep pre-migration SQLite archive through the rollback window.

## Structure

```text
.
├── AGENTS.md
├── Dockerfile
├── astro.config.ts
├── docker-entrypoint.sh
├── dokploy.env.example
├── runtime-secrets.env.example
├── config/traefik-compress.yml
├── docs/
├── scripts/
├── src/
└── tests/
```

## Deliberate non-features

- No Docker Compose deployment.
- No production SQLite app volume.
- No public libSQL port.
- No embedded replica.
- No secrets in Docker build args or Git.
- No production DB seed on every startup.
- No “backup works” claim without a restore drill.

## License

Choose and add the downstream project license before publishing.
