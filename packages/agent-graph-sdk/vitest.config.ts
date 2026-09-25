import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
