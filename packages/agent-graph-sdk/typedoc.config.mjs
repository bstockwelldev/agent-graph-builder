// SDK 7/7 (STO-619): the API reference site (`pnpm run docs` -> docs-site/),
// one module per entry point. The release workflow publishes it to Pages.
import { OptionDefaults } from "typedoc";

/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  name: "@bstockwelldev/agent-graph-sdk",
  entryPoints: ["src/index.ts", "src/graph/index.ts", "src/react/index.ts", "src/testing/index.ts"],
  tsconfig: "tsconfig.json",
  out: "docs-site",
  readme: "README.md",
  excludePrivate: true,
  excludeInternal: true,
  // openapi-typescript's generated types use @description.
  blockTags: [...OptionDefaults.blockTags, "@description"],
  // Internal helper aliases (request shapes, handler plumbing) are documented
  // where they're used, not as standalone pages.
  validation: { notExported: false, invalidLink: true, notDocumented: false },
  treatWarningsAsErrors: true,
};
