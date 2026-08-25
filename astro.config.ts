import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local, s3 } from "emdash/astro";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEmDashDatabase } from "./src/lib/database-config";

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return result;
}

const env = {
  ...parseEnvFile(path.resolve(".env")),
  ...parseEnvFile(path.resolve(".env.local")),
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ),
};
const siteUrl = env.SITE_URL || "http://localhost:4321";
const runtimeLibsqlEntrypoint = fileURLToPath(
  new URL("./src/emdash/runtime-libsql-dialect.ts", import.meta.url),
).replace(/\\/g, "/");
const useS3 =
  env.EMDASH_STORAGE_DRIVER === "s3" ||
  Boolean(env.S3_ENDPOINT && env.S3_BUCKET);

export default defineConfig({
  site: siteUrl,
  output: "server",
  adapter: node({ mode: "standalone" }),
  session: {
    cookie: {
      secure: env.NODE_ENV === "production" || siteUrl.startsWith("https://"),
    },
  },
  integrations: [
    emdash({
      database: createEmDashDatabase(env, runtimeLibsqlEntrypoint),
      storage: useS3
        ? s3({ publicUrl: env.S3_PUBLIC_URL })
        : local({
            directory: "./data/uploads",
            baseUrl: "/_emdash/api/media/file",
          }),
    }),
    react(),
  ],
  vite: {
    resolve: { dedupe: ["react", "react-dom", "@emdash-cms/admin"] },
    optimizeDeps: {
      include: ["@emdash-cms/admin", "@astrojs/react/client.js"],
    },
  },
});
