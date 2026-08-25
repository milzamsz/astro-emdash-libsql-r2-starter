import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";

const sourcePath = process.argv[2];
if (!sourcePath)
  throw new Error("Usage: pnpm run audit:parity -- /path/to/source.db");
const url = process.env.LIBSQL_URL;
const authToken = process.env.LIBSQL_AUTH_TOKEN;
if (!url || !authToken)
  throw new Error("LIBSQL_URL and LIBSQL_AUTH_TOKEN are required");

const source = new Database(sourcePath, { readonly: true });
const target = createClient({ url, authToken });
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const stable = (value) => {
  if (typeof value === "bigint") return { $integer: value.toString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { $blob: Buffer.from(value).toString("base64") };
  }
  if (value instanceof ArrayBuffer) {
    return { $blob: Buffer.from(new Uint8Array(value)).toString("base64") };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      $blob: Buffer.from(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      ).toString("base64"),
    };
  }
  return value;
};
const normalizeRows = (rows, keys) =>
  rows.map((row) =>
    Object.fromEntries(keys.map((key) => [key, stable(row[key])])),
  );
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function sourcePragma(name, table) {
  return source.prepare(`PRAGMA ${name}(${quote(table)})`).all();
}
async function targetPragma(name, table) {
  return (await target.execute(`PRAGMA ${name}(${quote(table)})`)).rows;
}
function normalizeColumns(rows) {
  return rows.map((row) => ({
    cid: Number(row.cid),
    name: String(row.name),
    type: String(row.type || "").toUpperCase(),
    notnull: Number(row.notnull),
    default: row.dflt_value === null ? null : String(row.dflt_value),
    pk: Number(row.pk),
  }));
}
async function indexProfile(table, side) {
  const list =
    side === "source"
      ? sourcePragma("index_list", table)
      : await targetPragma("index_list", table);
  const result = [];
  for (const row of list) {
    const name = String(row.name);
    const columns =
      side === "source"
        ? sourcePragma("index_info", name)
        : await targetPragma("index_info", name);
    result.push({
      name,
      unique: Number(row.unique),
      origin: String(row.origin || ""),
      partial: Number(row.partial || 0),
      columns: columns.map((column) => ({
        seqno: Number(column.seqno),
        cid: Number(column.cid),
        name: String(column.name),
      })),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
function normalizeForeignKeys(rows) {
  return rows
    .map((row) => ({
      id: Number(row.id),
      seq: Number(row.seq),
      table: String(row.table),
      from: String(row.from),
      to: String(row.to),
      on_update: String(row.on_update),
      on_delete: String(row.on_delete),
      match: String(row.match),
    }))
    .sort((a, b) => a.id - b.id || a.seq - b.seq);
}
async function contentDigest(table, columns, side) {
  const hash = createHash("sha256");
  const primary = columns
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  const order = primary.length ? primary.map(quote).join(", ") : "rowid";
  const keys = columns.map((column) => column.name);
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const sql = `SELECT * FROM ${quote(table)} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`;
    const rows =
      side === "source"
        ? source.prepare(sql).all()
        : (await target.execute(sql)).rows;
    if (!rows.length) break;
    for (const row of normalizeRows(rows, keys))
      hash.update(`${JSON.stringify(row)}\n`);
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  return hash.digest("hex");
}

const sourceTables = source
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all()
  .map((row) => String(row.name));
const targetTables = (
  await target.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
).rows.map((row) => String(row.name));
const names = [...new Set([...sourceTables, ...targetTables])].sort();
const rows = [];
for (const table of names) {
  const inSource = sourceTables.includes(table);
  const inTarget = targetTables.includes(table);
  if (!inSource || !inTarget) {
    rows.push({
      table,
      matches: false,
      missing: inSource ? "target" : "source",
    });
    continue;
  }
  const sourceColumns = normalizeColumns(sourcePragma("table_info", table));
  const targetColumns = normalizeColumns(
    await targetPragma("table_info", table),
  );
  const sourceCount = Number(
    source.prepare(`SELECT count(*) count FROM ${quote(table)}`).get().count,
  );
  const targetCount = Number(
    (await target.execute(`SELECT count(*) count FROM ${quote(table)}`)).rows[0]
      .count,
  );
  const sourceIndexes = await indexProfile(table, "source");
  const targetIndexes = await indexProfile(table, "target");
  const sourceForeignKeys = normalizeForeignKeys(
    sourcePragma("foreign_key_list", table),
  );
  const targetForeignKeys = normalizeForeignKeys(
    await targetPragma("foreign_key_list", table),
  );
  const sourceDigest = await contentDigest(table, sourceColumns, "source");
  const targetDigest = await contentDigest(table, targetColumns, "target");
  const checks = {
    columns: equal(sourceColumns, targetColumns),
    indexes: equal(sourceIndexes, targetIndexes),
    foreignKeys: equal(sourceForeignKeys, targetForeignKeys),
    rowCount: sourceCount === targetCount,
    contentDigest: sourceDigest === targetDigest,
  };
  rows.push({
    table,
    matches: Object.values(checks).every(Boolean),
    checks,
    sourceCount,
    targetCount,
    sourceDigest,
    targetDigest,
  });
}
source.close();
target.close();
const mismatches = rows.filter((row) => !row.matches);
console.log(
  JSON.stringify(
    { tables: rows.length, mismatchCount: mismatches.length, mismatches },
    null,
    2,
  ),
);
if (mismatches.length) process.exitCode = 1;
