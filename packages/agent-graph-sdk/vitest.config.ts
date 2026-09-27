import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only used by `test:coverage` (CI reports it; no thresholds).
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.*", "src/generated/**"],
      reporter: ["text-summary", "json-summary"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/react/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "react",
          // jsdom, keeping Node's AbortSignal so Node's fetch accepts it.
          environment: "./vitest.jsdom-env.ts",
          include: ["src/react/**/*.test.tsx"],
        },
      },
    ],
  },
});
