import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Prefer CommonJS export branches for transitive dependency chains exercised in Vitest.
    conditions: ["node", "require"],
  },
  test: {
    // Test environment variables
    env: {
      NODE_ENV: "test",
      VITEST: "true",
      // CLOUDBASE_MCP_TELEMETRY_DISABLED: 'true'
    },
    // Run tests in Node.js environment
    environment: "node",
    // Increase test timeout
    testTimeout: 120000,
    // Concurrency settings
    threads: false, // Disable worker threads to avoid port conflicts
    // Root directory
    root: process.cwd(),
    // Included test files
    include: ["../tests/**/*.test.js", "src/**/*.test.ts"],
    // Verbose reporter output
    reporter: "verbose",
    // Setup hooks
    globalSetup: [],
    setupFiles: [],
    server: {
      deps: {
        fallbackCJS: true,
        inline: [
          "@cloudbase/manager-node",
          "@cloudbase/toolbox",
          "cos-nodejs-sdk-v5",
          "request",
          "tough-cookie",
          "psl",
          "mustache",
          "express",
          "router",
          "is-promise",
          "uuid",
        ],
        external: [],
      },
    },
  },
});
