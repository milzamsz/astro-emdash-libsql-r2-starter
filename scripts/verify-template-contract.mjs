import { existsSync, readFileSync } from "node:fs";

const required = [
  "README.md",
  "AGENTS.md",
  "Dockerfile",
  "docker-entrypoint.sh",
  "dokploy.env.example",
  "runtime-secrets.env.example",
  "docs/DOKPLOY.md",
  "docs/MIGRATION.md",
  "docs/RESTORE-DRILL.md",
];
for (const file of required) {
  if (!existsSync(file))
    throw new Error(`Missing required template file: ${file}`);
}
const dockerfile = readFileSync("Dockerfile", "utf8");
if (/ARG (LIBSQL_AUTH_TOKEN|S3_SECRET_ACCESS_KEY)/.test(dockerfile)) {
  throw new Error("Secrets must not be Docker build args");
}
if (
  !dockerfile.includes("useradd --uid 10001") ||
  !readFileSync("docker-entrypoint.sh", "utf8").includes(
    "setpriv --reuid=10001",
  )
) {
  throw new Error(
    "Runtime must drop root privileges after reading the mounted secret file",
  );
}
if (
  (dockerfile.match(/ENV DB_DRIVER=libsql/g) || []).length !== 2 ||
  !dockerfile.includes("pnpm prune --prod")
) {
  throw new Error(
    "Both build and runtime stages must be libSQL-only and runtime dependencies must be pruned",
  );
}
const entrypoint = readFileSync("docker-entrypoint.sh", "utf8");
if (
  !entrypoint.includes("SQLite is forbidden in the production image") ||
  !entrypoint.includes("Placeholder credentials are forbidden")
) {
  throw new Error(
    "Production entrypoint must fail closed on SQLite and placeholders",
  );
}
const env = readFileSync("dokploy.env.example", "utf8");
if (env.includes("${{project.")) {
  throw new Error("Unresolved Dokploy project interpolation is forbidden");
}
console.log(
  "Template contract verified: two-service, stateless, runtime-secret architecture",
);
