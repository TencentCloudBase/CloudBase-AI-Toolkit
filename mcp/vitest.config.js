import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Help Vitest resolve CommonJS packages correctly
    conditions: ["node", "import", "module", "require"],
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
    // Externalization settings for CommonJS packages
    noExternal: [],
    external: ["@cloudbase/manager-node", "@cloudbase/toolbox"],
  },
});
