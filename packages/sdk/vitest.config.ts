import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // E2E suite is opt-in; default `pnpm test` script excludes it.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
