import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";

const suffix = String(process.pid);
const name = `starter-parity-${suffix}`;
const sourcePath = join(tmpdir(), `starter-parity-${suffix}.db`);
const credentials = `audit:${randomBytes(18).toString("base64url")}`;
const token = Buffer.from(credentials).toString("base64");
const docker = (args, options = {}) => execFileSync("docker", args, options);

try {
  docker(
    [
      "run",
      "-d",
      "--name",
      name,
      "-p",
      "127.0.0.1::8080",
      "-e",
      "SQLD_NODE=primary",
      "-e",
      `SQLD_HTTP_AUTH=basic:${token}`,
      "ghcr.io/tursodatabase/libsql-server:v0.24.33",
    ],
    { stdio: "ignore" },
  );
  const port = docker(["port", name, "8080/tcp"], { encoding: "utf8" })
    .trim()
    .split(":")
    .at(-1);
  const url = `http://127.0.0.1:${port}`;
  const target = createClient({ url, authToken: token });
  let connected = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await target.execute("SELECT 1");
      connected = true;
      break;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  if (!connected) throw new Error("Parity fixture libSQL did not start");

  const statements = [
    "PRAGMA foreign_keys=ON",
    "CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)",
    "CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, payload BLOB, score REAL DEFAULT 0, FOREIGN KEY(parent_id) REFERENCES parent(id) ON DELETE CASCADE)",
    "CREATE INDEX child_parent_score_idx ON child(parent_id, score)",
    "INSERT INTO parent(id,name) VALUES (1,'alpha'),(2,'beta')",
    "INSERT INTO child(id,parent_id,payload,score) VALUES (10,1,x'0001ff',1.5),(11,2,x'02',2.25)",
  ];
  const source = new DatabaseSync(sourcePath);
  for (const statement of statements) source.exec(statement);
  source.close();
  for (const statement of statements) await target.execute(statement);

  const env = { ...process.env, LIBSQL_URL: url, LIBSQL_AUTH_TOKEN: token };
  execFileSync(
    process.execPath,
    ["scripts/audit-libsql-parity.mjs", sourcePath],
    { env, stdio: "inherit" },
  );
  await target.execute("UPDATE child SET score=99 WHERE id=11");
  let detected = false;
  try {
    execFileSync(
      process.execPath,
      ["scripts/audit-libsql-parity.mjs", sourcePath],
      { env, stdio: "ignore" },
    );
  } catch {
    detected = true;
  }
  if (!detected)
    throw new Error(
      "Parity audit did not detect content mutation with unchanged row count",
    );
  target.close();
  console.log(
    "structural and content parity audit pass/fail behavior verified",
  );
} finally {
  try {
    docker(["rm", "-f", name], { stdio: "ignore" });
  } catch {}
  try {
    rmSync(sourcePath, { force: true });
  } catch {}
}
