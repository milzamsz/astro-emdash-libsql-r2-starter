import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production topology contract", () => {
  it("keeps the app stateless and credentials out of Docker build args", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).not.toContain("VOLUME");
    expect(dockerfile).not.toMatch(
      /ARG (LIBSQL_AUTH_TOKEN|S3_SECRET_ACCESS_KEY)/,
    );
    expect(dockerfile.match(/ENV DB_DRIVER=libsql/g)).toHaveLength(2);
    expect(dockerfile).toContain("ARG SITE_URL=http://localhost:4321");
    expect(dockerfile).toContain("pnpm prune --prod");
    expect(dockerfile).toContain("useradd --uid 10001");
    const entrypoint = read("docker-entrypoint.sh");
    expect(entrypoint).toContain("setpriv --reuid=10001");
    expect(entrypoint).toContain("SQLite is forbidden in the production image");
    expect(entrypoint).toContain("Placeholder credentials are forbidden");
    expect(entrypoint).toContain("*REPLACE_ME*");
    expect(entrypoint).toContain("*PLACEHOLDER*");
  });
  it("contains no unresolved Dokploy project interpolation", () => {
    expect(read("dokploy.env.example")).not.toContain("${{project.");
  });
  it("keeps each executable release gate as its own checklist item", () => {
    const checklist = read("docs/RELEASE-CHECKLIST.md");
    expect(checklist).toContain("- [ ] `pnpm run test:libsql`");
    expect(checklist).toContain("- [ ] `pnpm run test:parity`");
  });
  it("documents exactly two Dokploy services", () => {
    const readme = read("README.md");
    expect(readme).toContain("exactly two independent services");
    expect(readme).toContain("No Docker Compose deployment");
  });
  it("runs SQLite without the better-sqlite3 native addon", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies["better-sqlite3"]).toBeUndefined();
    expect(manifest.devDependencies["better-sqlite3"]).toBeUndefined();
    expect(read("Dockerfile")).not.toContain("better-sqlite3");
    expect(read("pnpm-workspace.yaml")).not.toContain("better-sqlite3");
    for (const script of [
      "scripts/audit-libsql-parity.mjs",
      "scripts/test-parity-audit.mjs",
      "scripts/test-docker-runtime.mjs",
    ]) {
      expect(read(script)).not.toContain("better-sqlite3");
    }
  });
});
