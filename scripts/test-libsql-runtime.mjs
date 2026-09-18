import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const suffix = String(process.pid);
const tag = `astro-emdash-libsql-smoke:${suffix}`;
const network = `astro-emdash-libsql-smoke-${suffix}`;
const dbName = `starter-libsql-${suffix}`;
const appName = `starter-app-${suffix}`;
const credentials = `starter:${randomBytes(18).toString("base64url")}`;
const token = Buffer.from(credentials).toString("base64");
const encryptionKey = `emdash_enc_v1_${randomBytes(32).toString("base64url")}`;
const docker = (args, options = {}) => execFileSync("docker", args, options);
const secretDir = join(tmpdir(), `astro-emdash-runtime-${suffix}`);
const secretPath = join(secretDir, "app.env");

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
  docker(["network", "create", network], { stdio: "ignore" });
  docker(
    [
      "run",
      "-d",
      "--name",
      dbName,
      "--network",
      network,
      "-e",
      "SQLD_NODE=primary",
      "-e",
      `SQLD_HTTP_AUTH=basic:${token}`,
      "ghcr.io/tursodatabase/libsql-server:v0.24.33",
    ],
    { stdio: "ignore" },
  );
  const secretContent = [
    `LIBSQL_AUTH_TOKEN=${token}`,
    `EMDASH_ENCRYPTION_KEY=${encryptionKey}`,
    "S3_ENDPOINT=http://127.0.0.1:9000",
    "S3_BUCKET=runtime-smoke",
    "S3_ACCESS_KEY_ID=smoke",
    "S3_SECRET_ACCESS_KEY=smoke-only",
    "S3_REGION=auto",
    "",
  ].join("\n");
  mkdirSync(secretDir, { mode: 0o700 });
  docker(
    [
      "run",
      "--rm",
      "-i",
      "-v",
      `${secretDir}:/out`,
      "node:24-slim",
      "sh",
      "-lc",
      "umask 077; cat > /out/app.env",
    ],
    { input: secretContent, stdio: ["pipe", "ignore", "inherit"] },
  );
  docker(
    [
      "run",
      "-d",
      "--name",
      appName,
      "--network",
      network,
      "-e",
      "DB_DRIVER=libsql",
      "-e",
      `LIBSQL_URL=http://${dbName}:8080`,
      "-v",
      `${secretPath}:/run/secrets/app.env:ro`,
      tag,
    ],
    { stdio: "ignore" },
  );

  let ready = false;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      docker([
        "exec",
        appName,
        "node",
        "-e",
        "fetch('http://127.0.0.1:4321/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
      ]);
      ready = true;
      break;
    } catch {
      const running = docker(
        ["inspect", "--format", "{{.State.Running}}", appName],
        { encoding: "utf8" },
      ).trim();
      if (running !== "true") break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  if (!ready) {
    const logs = docker(["logs", appName], { encoding: "utf8" });
    throw new Error(
      `App did not become healthy against blank libSQL:\n${logs}`,
    );
  }

  const processList = docker(["top", appName, "-eo", "pid,uid,comm"], {
    encoding: "utf8",
  });
  if (
    !processList.split("\n").some((line) => /^\d+\s+10001\s+/.test(line.trim()))
  ) {
    throw new Error(`Node is not running as UID 10001:\n${processList}`);
  }
  let secretUnreadable = false;
  try {
    docker(
      [
        "exec",
        "--user",
        "10001:10001",
        appName,
        "sh",
        "-lc",
        "cat /run/secrets/app.env >/dev/null",
      ],
      { stdio: "ignore" },
    );
  } catch {
    secretUnreadable = true;
  }
  if (!secretUnreadable)
    throw new Error(
      "Dropped-privilege Node user can still read the root-only secret mount",
    );
  console.log("runtime Node UID 10001 verified");
  console.log("root-only secret unreadable after privilege drop verified");

  const result = docker(
    [
      "exec",
      "-e",
      `LIBSQL_AUTH_TOKEN=${token}`,
      appName,
      "node",
      "--input-type=module",
      "-e",
      `import {createClient} from '@libsql/client'; const db=createClient({url:process.env.LIBSQL_URL,authToken:process.env.LIBSQL_AUTH_TOKEN}); const r=await db.execute("SELECT count(*) count FROM sqlite_master WHERE type='table'"); const count=Number(r.rows[0].count); db.close(); if(count<10)process.exit(1); console.log('blank libSQL bootstrap ok tables='+count);`,
    ],
    { encoding: "utf8" },
  );
  process.stdout.write(result);
} finally {
  for (const name of [appName, dbName]) {
    try {
      docker(["rm", "-f", name], { stdio: "ignore" });
    } catch {}
  }
  try {
    docker(["network", "rm", network], { stdio: "ignore" });
  } catch {}
  try {
    docker(["image", "rm", "-f", tag], { stdio: "ignore" });
  } catch {}
  try {
    rmSync(secretDir, { recursive: true, force: true });
  } catch {}
}
