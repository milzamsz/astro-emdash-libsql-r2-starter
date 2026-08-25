import { describe, expect, it } from "vitest";
import { createEmDashDatabase } from "../src/lib/database-config";

describe("createEmDashDatabase", () => {
  it("uses SQLite by default", () => {
    expect(createEmDashDatabase({})).toMatchObject({ type: "sqlite" });
  });
  it("ships a runtime descriptor for libSQL without credentials", () => {
    const result = createEmDashDatabase(
      { DB_DRIVER: "libsql", LIBSQL_AUTH_TOKEN: "must-not-be-serialized" },
      "/app/runtime-libsql.js",
    );
    expect(result).toEqual({
      entrypoint: "/app/runtime-libsql.js",
      config: { fallbackUrl: "file:./data/emdash.db" },
      type: "sqlite",
    });
    expect(JSON.stringify(result)).not.toContain("must-not-be-serialized");
  });
  it("rejects unsupported drivers", () => {
    expect(() => createEmDashDatabase({ DB_DRIVER: "postgres" })).toThrow(
      "Unsupported DB_DRIVER",
    );
  });
});
