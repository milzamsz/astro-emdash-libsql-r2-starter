import { execFileSync } from "node:child_process";

const tag = `astro-emdash-starter-smoke:${process.pid}`;
const docker = (args, options = {}) => execFileSync("docker", args, options);

try {
  docker(
    [
      "build",
      "--build-arg",
      "SITE_URL=https://starter.example",
      "--target",
      "runtime",
      "-t",
      tag,
      ".",
    ],
    {
      stdio: "inherit",
    },
  );
  const compatibility = docker(
    [
      "run",
      "--rm",
      "--entrypoint",
      "node",
      tag,
      "-e",
      "const DB=require('better-sqlite3'); const db=new DB(':memory:'); if(db.prepare('SELECT 1 v').get().v!==1) process.exit(1); console.log('runtime sqlite compatibility ok')",
    ],
    { encoding: "utf8" },
  );
  process.stdout.write(compatibility);

  docker([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    tag,
    "-lc",
    "grep -R -q 'runtime-libsql-dialect' /app/dist/server && grep -R -q 'emdash/storage/s3' /app/dist/server && grep -R -q 'https://starter.example' /app/dist/server && test ! -x /app/node_modules/.bin/vitest && test ! -x /app/node_modules/.bin/prettier",
  ]);
  console.log(
    "runtime libSQL/S3 descriptors, canonical origin, and dependency pruning verified",
  );

  let missingSecretsFailed = false;
  try {
    docker(["run", "--rm", tag], { stdio: "pipe" });
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    missingSecretsFailed = output.includes("LIBSQL_URL is required");
  }
  if (!missingSecretsFailed)
    throw new Error(
      "Production image did not fail closed without libSQL secrets",
    );

  let placeholderFailed = false;
  try {
    docker(
      [
        "run",
        "--rm",
        "-e",
        "LIBSQL_URL=http://database:8080",
        "-e",
        "LIBSQL_AUTH_TOKEN=replace_me",
        "-e",
        "S3_ENDPOINT=http://r2.invalid",
        "-e",
        "S3_BUCKET=test",
        "-e",
        "S3_ACCESS_KEY_ID=CHANGE_ME",
        "-e",
        "S3_SECRET_ACCESS_KEY=CHANGE_ME",
        "-e",
        "EMDASH_ENCRYPTION_KEY=CHANGE_ME",
        tag,
      ],
      { stdio: "pipe" },
    );
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    placeholderFailed =
      output.includes("malformed or a placeholder") ||
      output.includes("Placeholder credentials");
  }
  if (!placeholderFailed)
    throw new Error("Production image accepted placeholder credentials");
  console.log(
    "production missing-secret and placeholder fail-closed checks passed",
  );
} finally {
  try {
    docker(["image", "rm", "-f", tag], { stdio: "ignore" });
  } catch {}
}
