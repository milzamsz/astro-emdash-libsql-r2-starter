import { sqlite } from "emdash/db";

export interface ConfigEnv {
  [key: string]: string | undefined;
}

interface RuntimeDatabaseDescriptor {
  entrypoint: string;
  config: { fallbackUrl: string };
  type: "sqlite";
}

export function createEmDashDatabase(
  env: ConfigEnv,
  runtimeLibsqlEntrypoint?: string,
) {
  const driver = env.DB_DRIVER?.trim().toLowerCase() || "sqlite";
  if (driver === "sqlite") {
    return sqlite({ url: env.DATABASE_URL || "file:./data/emdash.db" });
  }
  if (driver === "libsql") {
    if (!runtimeLibsqlEntrypoint) {
      throw new Error("A runtime libSQL adapter entrypoint is required");
    }
    return {
      entrypoint: runtimeLibsqlEntrypoint,
      config: { fallbackUrl: env.DATABASE_URL || "file:./data/emdash.db" },
      type: "sqlite",
    } satisfies RuntimeDatabaseDescriptor;
  }
  throw new Error(`Unsupported DB_DRIVER: ${driver}`);
}
