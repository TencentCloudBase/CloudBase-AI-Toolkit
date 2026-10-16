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
      // 测试里不出网：工具调用/资源读取本来就有 isTestEnvironment 守卫，这条把 `telemetryReporter`
      // 自己也关掉（否则新增的会话级上报会在握手测试里真的 POST）。
      CLOUDBASE_MCP_TELEMETRY_DISABLED: 'true'
    },
    // Run tests in Node.js environment
    environment: "node",
    // Increase test timeout
    testTimeout: 120000,
    // Avoid worker-thread pool to reduce flaky port conflicts in integration tests
    pool: "forks",
    fileParallelism: false,
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
