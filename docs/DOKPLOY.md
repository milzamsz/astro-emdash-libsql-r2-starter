# Dokploy Deployment: Exactly Two Services

This runbook creates one Application and one native libSQL service. R2 is external.

## 1. Naming

| Resource    | Example                             |
| ----------- | ----------------------------------- |
| Project     | `example-site`                      |
| Environment | `production`                        |
| Application | `Example Web` / `example-web`       |
| Native DB   | `Example libSQL` / `example-libsql` |
| Domain      | `example.com`                       |

Production resource names must not contain “staging”. If staging is required, create a separate environment with its own app, database, bucket, and credentials.

## 2. Create native libSQL first

- mode: primary;
- namespaces: disabled for a single CMS;
- image: pinned `ghcr.io/tursodatabase/libsql-server:v0.24.32`;
- public ports: none;
- persistence: Dokploy-managed volume.

Deploy and read back generated internal hostname, DB filename, and auth config. Do not guess.

Acceptance:

- service `1/1`;
- authenticated `SELECT 1` from `dokploy-network`;
- no host-published port;
- volume and pinned image visible.

## 3. Initialize or migrate

For an existing site, follow `MIGRATION.md`. Do not auto-seed production on every app startup; app restarts while DB persists.

## 4. Root-only runtime secrets

```bash
sudo install -d -m 700 /etc/dokploy/secrets
sudo install -m 600 runtime-secrets.env /etc/dokploy/secrets/example-web.env
```

Use shell-compatible `KEY=value`; quote values with spaces.

Application bind mount:

```text
Host:      /etc/dokploy/secrets/example-web.env
Container: /run/secrets/app.env
Type:      bind
```

This is configuration, not a data volume.

## 5. Create Application

- source: GitHub/Git;
- build: Dockerfile, context `.`;
- source ref: immutable release tag;
- trigger: tag;
- auto deploy: false for manual releases;
- replicas: 1;
- internal port: 4321;
- persistent data mounts: none.

Paste `dokploy.env.example` after replacing placeholders. Avoid `${{project.*}}` unless project variables are explicitly created and verified on the selected build server.

## 6. R2

Create a dedicated bucket and least-privilege S3 token. Required R2 CORS for EmDash browser uploads:

```json
[
  {
    "AllowedOrigins": ["https://example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Never grant bucket-admin credentials to the app. Verify both JPEG and MP4 signed browser PUTs from the production origin; direct server-side S3 success does not validate browser CORS.

## 7. Domain and compression

Point DNS to the server. Add HTTPS/Let's Encrypt domain on port 4321.

Copy `config/traefik-compress.yml` to `/etc/dokploy/traefik/dynamic/example-compress.yml`, then attach `example-compress@file` to the domain. Verify large admin JS returns `Content-Encoding: br` or `gzip` and `Vary: Accept-Encoding`.

## 8. Deploy once

Choose one:

- manual deploy with auto-deploy disabled; or
- tag webhook with no manual click.

Concurrent deploys can both build and race on Swarm service creation (`409 AlreadyExists`).

## 9. Post-deploy acceptance

```text
GET /api/health          200
GET /                    200
GET /_emdash/admin       login/admin shell
Application              1/1
libSQL                   1/1
App mounts               secret file only
Logs                     no DB/storage errors
```

Perform authenticated content edit, image upload, and video upload. Confirm R2 objects, then delete test media through CMS.

## 10. Backups

Create native libSQL backup with the correct active DB filename, daily schedule, explicit retention, and private destination. Run a manual backup, then complete `RESTORE-DRILL.md`.
