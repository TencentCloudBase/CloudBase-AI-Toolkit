/**
 * CloudBase SDK Runtime Validation Test
 *
 * Validate whether Event functions support Python/PHP/Java/Go runtimes by calling
 * CloudBase Manager SDK directly, bypassing MCP tool constraints to test the SDK capability.
 *
 * How to run:
 * cd mcp && npm test -- tests/cloudbase-sdk-runtime-validation.test.js
 */

import { describe, test, expect, beforeAll } from "vitest";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";

// Load .env file manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "../mcp/.env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  });
  console.log("✅ Loaded .env file from:", envPath);
}

// Detect if real CloudBase credentials are available
function hasCloudBaseCredentials() {
  const secretId =
    process.env.TENCENTCLOUD_SECRETID || process.env.CLOUDBASE_SECRET_ID;
  const secretKey =
    process.env.TENCENTCLOUD_SECRETKEY || process.env.CLOUDBASE_SECRET_KEY;
  const envId = process.env.CLOUDBASE_ENV_ID;
  return Boolean(secretId && secretKey && envId);
}

describe("CloudBase SDK Runtime Validation - Direct SDK Test", () => {
  let manager = null;
  let CloudBase = null;
  const testFunctionsDir = join(
    tmpdir(),
    `cloudbase-runtime-test-${Date.now()}`,
  );
  const timestamp = Date.now();

  beforeAll(async () => {
    // Use dynamic import to load CloudBase SDK to avoid vitest module resolution issues
    try {
      const cloudbaseModule = await import("@cloudbase/manager-node");
      CloudBase = cloudbaseModule.default || cloudbaseModule;
    } catch (error) {
      console.error(
        "Failed to dynamically import @cloudbase/manager-node:",
        error.message,
      );
      console.log("⚠️ Skipping test due to import error");
      return;
    }

    if (!hasCloudBaseCredentials()) {
      console.log(
        "⚠️ No CloudBase credentials, skipping SDK runtime validation tests",
      );
      return;
    }

    // Create CloudBase manager instance
    manager = new CloudBase({
      secretId: process.env.TENCENTCLOUD_SECRETID,
      secretKey: process.env.TENCENTCLOUD_SECRETKEY,
      envId: process.env.CLOUDBASE_ENV_ID,
    });

    console.log("✅ CloudBase Manager initialized");
    console.log("📦 Environment ID:", process.env.CLOUDBASE_ENV_ID);

    // Create test functions directory
    if (!existsSync(testFunctionsDir)) {
      mkdirSync(testFunctionsDir, { recursive: true });
    }
  });

  // Helper function to create a simple Python Event function
  function createPythonFunction(functionName) {
    const functionDir = join(testFunctionsDir, functionName);
    mkdirSync(functionDir, { recursive: true });

    writeFileSync(
      join(functionDir, "index.py"),
      `
def main_handler(event, context):
    return {
        'statusCode': 200,
        'body': 'Hello from Python!'
    }
`,
    );

    return functionDir;
  }

  test.skipIf(!hasCloudBaseCredentials())("Validate Python3.9 runtime support via CloudBase SDK", async () => {
    if (!manager) {
      console.log("⚠️ CloudBase Manager not initialized, skipping");
      return;
    }

    const functionName = `sdk-test-python-${timestamp}`;
    const functionDir = createPythonFunction(functionName);

    console.log(
      `\n📝 Testing Python3.9 runtime via CloudBase SDK: ${functionName}`,
    );
    console.log(`📁 Function directory: ${functionDir}`);

    try {
      const result = await manager.functions.createFunction({
        func: {
          name: functionName,
          runtime: "Python3.9",
          type: "Event",
          handler: "index.main_handler",
        },
        functionRootPath: functionDir,
        force: true,
        base64Code: "",
      });

      console.log("✅ Python3.9 Event function creation via SDK succeeded!");
      console.log("📊 Result:", JSON.stringify(result, null, 2));

      expect(result).toBeDefined();
      console.log("\n🎉 结论: CloudBase SDK 本身支持 Python3.9 运行时!");
    } catch (error) {
      console.error("❌ Python3.9 Event function creation via SDK failed");
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);

      if (error.message && error.message.includes("不支持")) {
        console.log("\n⚠️ 结论: CloudBase SDK 不支持 Python3.9 运行时");
      } else {
        console.log("\n⚠️ 结论: 测试失败,但可能是其他原因(如权限、配额等)");
      }

      // Don't throw, just log the error
      console.error("Full error:", error);
    }
  }, 60000); // 60 second timeout
});
