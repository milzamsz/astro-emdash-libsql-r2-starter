import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  engines: { node: string; pnpm: string };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("stack version alignment", () => {
  it("keeps the Node type definitions on the runtime major", () => {
    // engines.node is ">=24 <25" and the image is node:24-slim. Types ahead of
    // the runtime let code compile against APIs the container does not have.
    const runtimeMajor = pkg.engines.node.match(/>=(\d+)/)?.[1];
    expect(runtimeMajor).toBe("24");
    expect(pkg.devDependencies["@types/node"]).toMatch(/^\^24\./);
  });

  it("tracks the current Astro 7 adapter line", () => {
    expect(pkg.dependencies.astro).toBe("^7.3.3");
    expect(pkg.dependencies["@astrojs/node"]).toBe("^11.1.6");
    expect(pkg.dependencies["@astrojs/react"]).toBe("^6.0.6");
  });

  it("tracks the current React 19 line", () => {
    expect(pkg.dependencies.react).toBe("^19.3.0");
    expect(pkg.dependencies["react-dom"]).toBe("^19.3.0");
  });

  it("keeps TypeScript on the line @astrojs/check supports", () => {
    // @astrojs/check 0.9.10 declares peer typescript ^5.0.0 || ^6.0.0.
    expect(pkg.devDependencies.typescript).toMatch(/^\^6\./);
  });
  it("pins EmDash exactly to the validated release", () => {
    // A caret range would let a future 0.x minor land unreviewed, and EmDash
    // ships database migrations in minors.
    expect(pkg.dependencies.emdash).toBe("0.38.0");
  });

  it("documents the EmDash version it installs", () => {
    expect(readFileSync("AGENTS.md", "utf8")).toContain("EmDash 0.38.0");
    expect(readFileSync("README.md", "utf8")).toContain("EmDash 0.38.0");
  });

  it("pins one libSQL server image across docs and smoke tests", () => {
    const pin = "ghcr.io/tursodatabase/libsql-server:v0.24.33";
    expect(readFileSync("docs/DOKPLOY.md", "utf8")).toContain(pin);
    expect(readFileSync("scripts/test-libsql-runtime.mjs", "utf8")).toContain(
      pin,
    );
    expect(readFileSync("scripts/test-parity-audit.mjs", "utf8")).toContain(pin);
  });
});
