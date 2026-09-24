import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SDK 5/7 + 6/7: each entry point's module graph stays within its
// dependencies -- the core and /graph never reach React, TanStack or MSW.

const src = dirname(fileURLToPath(import.meta.url));

function packagesReachedFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    // Comments stripped; type-only imports are erased at build, so they don't count.
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const match of code.matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)) {
      const spec = match[1];
      if (/^(?:import|export)\s+type\b/.test(match[0])) continue;
      if (spec.startsWith(".")) {
        const base = resolve(dirname(file), spec).replace(/\.js$/, "");
        visit([`${base}.ts`, `${base}.tsx`].find((candidate) => { try { readFileSync(candidate); return true; } catch { return false; } })!);
      } else {
        packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
      }
    }
  };
  visit(resolve(src, entry));
  return packages;
}

describe("entry point dependencies", () => {
  it("core needs only zod and @noble/hashes", () => {
    expect([...packagesReachedFrom("index.ts")].sort()).toEqual(["@noble/hashes", "zod"]);
  });
  it("/graph needs nothing", () => {
    expect([...packagesReachedFrom("graph/index.ts")]).toEqual([]);
  });
  it("/testing adds only msw; /react adds only react and TanStack Query", () => {
    expect([...packagesReachedFrom("testing/index.ts")].sort()).toEqual(["@noble/hashes", "msw", "zod"]);
    expect([...packagesReachedFrom("react/index.ts")].sort()).toEqual(["@noble/hashes", "@tanstack/react-query", "react", "zod"]);
  });
});
