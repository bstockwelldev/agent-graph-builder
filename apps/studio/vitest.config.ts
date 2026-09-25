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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
