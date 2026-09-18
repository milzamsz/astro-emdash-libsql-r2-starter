import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Read the mounted runtime secret inside the container. Passing the token as a
// `docker exec -e` argument would publish it in the host process table, which
// AGENTS.md forbids for credentials.
const readSecretPrelude = `import {readFileSync} from 'node:fs';
const secret=Object.fromEntries(readFileSync('/run/secrets/app.env','utf8').split(String.fromCharCode(10)).filter(Boolean).map((line)=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
`;
// Probe the health endpoint from inside the container and report the real
// status instead of a bare boolean, so a failure explains itself.
const healthProbe = () => {
  const script = `
    try {
      const r = await fetch('http://127.0.0.1:4321/api/health', { redirect: 'manual' });
      const body = (await r.text()).slice(0, 200);
      console.log(JSON.stringify({ status: r.status, location: r.headers.get('location'), body }));
    } catch (error) {
      console.log(JSON.stringify({ error: String(error.message).slice(0, 200) }));
    }
  `;
  try {
    const raw = docker(
      ["exec", appName, "node", "--input-type=module", "-e", script],
      { encoding: "utf8" },
    );
    const last = raw.trim().split("\n").pop();
    const parsed = JSON.parse(last);
    if (typeof parsed.status === "number")
      return {
        ok: parsed.status >= 200 && parsed.status < 300,
        detail: JSON.stringify(parsed),
      };
    return { ok: false, detail: JSON.stringify(parsed) };
  } catch (error) {
    return {
      ok: false,
      detail: `exec failed: ${String(error.message).split("\n")[0]}`,
    };
  }
};
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
  mkdirSync(secretDir, { mode: 0o700 });
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
  const serverEnvPath = join(secretDir, "libsql.env");
  writeFileSync(
    serverEnvPath,
    `SQLD_NODE=primary\nSQLD_HTTP_AUTH=basic:${token}\n`,
    { mode: 0o600 },
  );
  docker(
    [
      "run",
      "-d",
      "--name",
      dbName,
      "--network",
      network,
      "--env-file",
      serverEnvPath,
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
  let lastProbe = "no probe attempted";
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const probe = healthProbe();
    lastProbe = probe.detail;
    if (probe.ok) {
      ready = true;
      break;
    }
    const status = docker(
      ["inspect", "--format", "{{.State.Status}}", appName],
      { encoding: "utf8" },
    ).trim();
    if (status === "exited" || status === "dead") break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) {
    const logs = docker(["logs", appName], { encoding: "utf8" });
    throw new Error(
      `App did not become healthy against blank libSQL. Last /api/health response: ${lastProbe}\n${logs}`,
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
      appName,
      "node",
      "--input-type=module",
      "-e",
      `${readSecretPrelude}import {createClient} from '@libsql/client';
const db=createClient({url:process.env.LIBSQL_URL,authToken:secret.LIBSQL_AUTH_TOKEN});
const tables=Number((await db.execute("SELECT count(*) count FROM sqlite_master WHERE type='table'")).rows[0].count);
const locks=Number((await db.execute("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='_emdash_entry_locks'")).rows[0].count);
const applied=(await db.execute("SELECT name FROM _emdash_migrations ORDER BY name")).rows.map(r=>String(r.name));
db.close();
if(tables<10)process.exit(1);
if(locks!==1){console.error('_emdash_entry_locks table missing');process.exit(1);}
for(const required of ['072_media_folders','073_media_focal_point','075_entry_edit_locks','076_collection_nav_group','077_plugin_storage_revisions']) if(!applied.includes(required)){console.error('missing migration '+required);process.exit(1);}
console.log('blank libSQL bootstrap ok tables='+tables+' applied='+applied.length+' head='+applied[applied.length-1]);`,
    ],
    { encoding: "utf8" },
  );
  process.stdout.write(result);
  const firstRunCount = Number(/applied=(\d+)/.exec(result)?.[1]);
  if (!Number.isInteger(firstRunCount) || firstRunCount < 76)
    throw new Error(
      `Could not parse the first-run migration count from:\n${result}`,
    );

  // Second run: restarting the app against an already-migrated database must
  // boot cleanly and must not re-apply or duplicate any migration.
  docker(["restart", appName], { stdio: "ignore" });

  // `docker restart` returns while the container is still cycling, so
  // .State.Running briefly reads "false". Wait for the container to settle
  // into "running" instead of mistaking a transient state for a crash.
  const status = () =>
    docker(["inspect", "--format", "{{.State.Status}}", appName], {
      encoding: "utf8",
    }).trim();
  const settle = (attempts) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const state = status();
      if (state === "running") return true;
      if (state === "exited" || state === "dead") return false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    return false;
  };
  if (!settle(180)) {
    const logs = docker(["logs", appName], { encoding: "utf8" });
    throw new Error(
      `Container did not return to a running state after restart:\n${logs}`,
    );
  }

  let secondRunHealthy = false;
  let lastSecondProbe = "no probe attempted";
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const probe = healthProbe();
    lastSecondProbe = probe.detail;
    if (probe.ok) {
      secondRunHealthy = true;
      break;
    }
    const state = status();
    if (state === "exited" || state === "dead") break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!secondRunHealthy) {
    const logs = docker(["logs", appName], { encoding: "utf8" });
    throw new Error(
      `App did not become healthy on the second run. Last /api/health response: ${lastSecondProbe}\n${logs}`,
    );
  }
  const secondRunCount = Number(
    docker(
      [
        "exec",
        appName,
        "node",
        "--input-type=module",
        "-e",
        `${readSecretPrelude}import {createClient} from '@libsql/client';
const db=createClient({url:process.env.LIBSQL_URL,authToken:secret.LIBSQL_AUTH_TOKEN});
const n=Number((await db.execute("SELECT count(*) count FROM _emdash_migrations")).rows[0].count);
db.close();
console.log(String(n));`,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  if (secondRunCount !== firstRunCount)
    throw new Error(
      `Second run changed the migration count ${firstRunCount} -> ${secondRunCount}; migrations are not idempotent`,
    );
  console.log(
    `second run re-applied nothing: migration count ${firstRunCount} -> ${secondRunCount} (idempotent)`,
  );
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
