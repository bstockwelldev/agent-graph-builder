// SDK 7/7 (STO-619): bundle-size budget per entry point. Bundles each
// entry the way an app would (esbuild, minified, peer dependencies
// external) and fails when its gzipped size exceeds the budget in
// size-budget.json. Raise a budget deliberately, in the PR that needs it.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const budgets = JSON.parse(readFileSync(new URL("size-budget.json", root), "utf8"));
const external = Object.keys(pkg.peerDependencies ?? {}).flatMap((name) => [name, `${name}/*`]);

let failed = false;
for (const [entry, budgetKb] of Object.entries(budgets)) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, root))],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
    external,
    logLevel: "silent",
  });
  const gzipKb = gzipSync(result.outputFiles[0].contents).length / 1024;
  const ok = gzipKb <= budgetKb;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${entry.padEnd(28)} ${gzipKb.toFixed(1).padStart(6)} kB gzip (budget ${budgetKb} kB)`);
}
process.exit(failed ? 1 : 0);
