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
});
