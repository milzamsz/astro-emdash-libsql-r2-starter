# Operations

## Monitor

- App/libSQL replicas, restarts, CPU, memory, disk.
- `/api/health`.
- DB initialization, migration, storage, upload, media-usage errors.
- Backup completion/retention.
- R2 object usage and errors.

## Secrets rotation

1. Generate replacement.
2. Atomically update `/etc/dokploy/secrets/<app>.env`.
3. Coordinate libSQL server/app token rotation.
4. Reload affected services.
5. Read back exact state.
6. Revoke old credential.

## Media performance

- Compress EmDash admin bundle at Traefik.
- Keep admin media-list same-origin so `/_image` creates 400px WebP thumbnails.
- Never load 5–20 MB originals in every grid cell.
- Cache immutable transformed assets.
- Remove broken rows only after backup and proof usage=0.

## Triage

| Symptom                  | First checks                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| Invalid project variable | unresolved `${{project.*}}`; mounted runtime secrets               |
| Writes disappear         | artifact still SQLite; ephemeral local state                       |
| Upload fails             | upload URL, CSP/CORS, S3 descriptor, size/type                     |
| Admin stuck loading      | compression, bundle transfer/parse, thumbnail URLs, original sizes |
| Relative href fails      | subfield must be `string` in seed and live schema                  |
| Deploy 409               | webhook/manual race; disable one trigger, clean queue              |
| Media 404                | DB key vs R2 object; usage before cleanup                          |

Persistent capacity belongs to libSQL volume, R2 bucket, and backup destination. App filesystem is disposable.
