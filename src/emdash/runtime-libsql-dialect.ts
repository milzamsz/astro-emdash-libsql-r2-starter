import { createDialect as createLibsqlDialect } from "emdash/db/libsql";
import { createDialect as createSqliteDialect } from "emdash/db/sqlite";

interface RuntimeDialectConfig {
  fallbackUrl?: string;
}

export function createDialect(config: RuntimeDialectConfig) {
  const driver = process.env.DB_DRIVER?.trim().toLowerCase();
  if (driver === "libsql") {
    const url = process.env.LIBSQL_URL?.trim();
    const authToken = process.env.LIBSQL_AUTH_TOKEN?.trim();
    if (!url || !authToken) {
      throw new Error(
        "LIBSQL_URL and LIBSQL_AUTH_TOKEN are required in libSQL mode",
      );
    }
    return createLibsqlDialect({ url, authToken });
  }
  if (driver === "sqlite") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SQLite fallback is forbidden in production");
    }
    return createSqliteDialect({
      url: config.fallbackUrl || "file:./data/emdash.db",
    });
  }
  throw new Error("DB_DRIVER must be explicitly set to libsql or sqlite");
}
