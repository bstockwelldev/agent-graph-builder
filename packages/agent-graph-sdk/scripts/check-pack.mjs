// SDK 7/7 (STO-619): verifies what `npm pack` would publish -- every
// `exports` target and the docs are in, and nothing else (sources, tests,
// fixtures, tooling) leaks. Run after `pnpm run build`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const [report] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: new URL("..", import.meta.url), encoding: "utf8" }));
const files = new Set(report.files.map((file) => file.path));

const targets = Object.values(pkg.exports).flatMap((entry) => (typeof entry === "string" ? [entry] : Object.values(entry)));
const required = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", ...targets.map((target) => target.replace(/^\.\//, ""))];
const missing = required.filter((file) => !files.has(file));
const forbidden = [...files].filter((file) => !/^dist\//.test(file) && !required.includes(file));
const leaked = [...files].filter((file) => /\.test\.|\.tsbuildinfo$/.test(file));

const problems = [
  ...missing.map((file) => `missing: ${file}`),
  ...forbidden.map((file) => `unexpected: ${file}`),
  ...leaked.map((file) => `leaked: ${file}`),
];
if (problems.length > 0) {
  console.error(`npm pack check failed for ${report.name}@${report.version}:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`npm pack OK: ${report.name}@${report.version}, ${files.size} files, ${(report.size / 1024).toFixed(1)} kB packed / ${(report.unpackedSize / 1024).toFixed(1)} kB unpacked`);
