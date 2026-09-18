# syntax=docker/dockerfile:1
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
# Public origin is a non-secret build argument used by Astro canonical metadata.
ARG SITE_URL=http://localhost:4321
# Select descriptors only. Credentials remain runtime-only.
ENV SITE_URL=$SITE_URL
ENV DB_DRIVER=libsql
ENV EMDASH_STORAGE_DRIVER=s3
ENV ASTRO_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run verify:template && pnpm build
RUN pnpm prune --prod

FROM base AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --no-create-home app
ENV NODE_ENV=production
ENV DB_DRIVER=libsql
ENV EMDASH_STORAGE_DRIVER=s3
ENV HOST=0.0.0.0
ENV PORT=4321
ENV ASTRO_TELEMETRY_DISABLED=1
COPY --chown=app:app --from=build /app/node_modules ./node_modules
COPY --chown=app:app --from=build /app/dist ./dist
COPY --chown=app:app --from=build /app/public ./public
COPY --chown=app:app package.json ./
COPY --chown=app:app docker-entrypoint.sh ./
COPY --chown=app:app scripts ./scripts
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4321/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
