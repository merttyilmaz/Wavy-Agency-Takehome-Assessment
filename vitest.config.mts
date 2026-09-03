import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside a React Server Component. Tests import the
      // same modules directly, so it is stubbed out here.
      "server-only": new URL("./src/tests/server-only-stub.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./src/tests/global-setup.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    // Integration tests share one Postgres database, so files must not run in
    // parallel. Concurrency inside a test file is explicit.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
