import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom, keeping Node's AbortSignal so Node's fetch (Node 22+) accepts
    // it -- shared with the SDK's /react tests; see the file for why.
    environment: "../../packages/agent-graph-sdk/vitest.jsdom-env.ts",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
    // Only used by `test:coverage` (CI reports it; no thresholds).
    coverage: {
      provider: "v8",
      include: ["app/**", "components/**", "content/**", "hooks/**", "layout/**", "lib/**"],
      exclude: ["**/*.test.*"],
      reporter: ["text-summary", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
