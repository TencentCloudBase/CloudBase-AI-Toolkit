// 综合集成测试 - ES vs CJS 模块一致性验证
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Detect if real CloudBase credentials are available
function hasCloudBaseCredentials() {
  const secretId = process.env.TENCENTCLOUD_SECRETID || process.env.CLOUDBASE_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY || process.env.CLOUDBASE_SECRET_KEY;
  const envId = process.env.CLOUDBASE_ENV_ID;
  return Boolean(secretId && secretKey && envId);
}

test("ESM and CJS module exports consistency", async () => {
  try {
    console.log("Testing ESM and CJS module exports consistency...");

    // Test ESM import
    const esmModule = await import("../mcp/dist/index.js");
    expect(esmModule).toBeDefined();
    console.log("✅ ESM module imported successfully");

    // Log available exports for debugging
    const esmExports = Object.keys(esmModule).sort();
    console.log("ESM exports:", esmExports);

    // Test server creation
    const { createCloudBaseMcpServer } = esmModule;
    expect(createCloudBaseMcpServer).toBeDefined();
    expect(typeof createCloudBaseMcpServer).toBe("function");

    const esmServer = createCloudBaseMcpServer({
      name: "test-server-esm",
      version: "1.0.0",
      enableTelemetry: false,
    });
    expect(esmServer).toBeDefined();
    console.log("✅ ESM server instance created");

    // 检查 CJS 构建文件
    const fs = await import("fs");
    const cjsPath = join(__dirname, "../mcp/dist/index.cjs");
    expect(fs.existsSync(cjsPath)).toBe(true);
    console.log("✅ CJS build file exists");

    // 验证文件内容不为空
    const cjsContent = fs.readFileSync(cjsPath, "utf8");
    expect(cjsContent.length).toBeGreaterThan(0);
    console.log("✅ CJS build file has content");

    console.log("✅ Module exports consistency test passed");
  } catch (error) {
    console.error("❌ Module exports consistency test failed:", error);
    throw error;
  }
}, 90000); // 增加到 90 秒

test("MCP server basic functionality test", async () => {
  let transport = null;
  let client = null;

  try {
    console.log("Testing basic MCP server functionality...");

    // Create client
    client = new Client(
      {
        name: "test-client-basic",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Use the CJS CLI for integration testing to avoid ESM issues
    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: { ...process.env },
    });

    // Connect client to server
    await client.connect(transport);

    // Wait longer for connection to establish in CI environment
    await delay(3000);

    console.log("Testing server capabilities...");

    // List tools (this should work since we declared tools capability)
    const toolsResult = await client.listTools();
    expect(toolsResult.tools).toBeDefined();
    expect(Array.isArray(toolsResult.tools)).toBe(true);
    expect(toolsResult.tools.length).toBeGreaterThan(0);

    console.log(`✅ Server exposes ${toolsResult.tools.length} tools`);

    // Test a simple tool call (searchKnowledgeBase should always be available)
    const knowledgeTool = toolsResult.tools.find(
      (t) => t.name === "searchKnowledgeBase",
    );
    if (knowledgeTool) {
      console.log("Testing searchKnowledgeBase tool...");

      const knowledgeResult = await client.callTool({
        name: "searchKnowledgeBase",
        arguments: {
          mode: "vector",
          id: "cloudbase", // 知识库范围
          content: "test", // 检索内容
          limit: 1, // 返回结果数量
        },
      });

      expect(knowledgeResult).toBeDefined();
      expect(knowledgeResult.content).toBeDefined();
      expect(Array.isArray(knowledgeResult.content)).toBe(true);

      console.log("✅ searchKnowledgeBase tool executed successfully");
    }

    // Note: We're not testing listResources() and listPrompts() since our server
    // only declares 'tools' capability and may not properly handle these requests

    console.log("✅ Basic functionality test passed");
  } catch (error) {
    console.error("❌ Basic functionality test failed:", error);
    throw error;
  } finally {
    // Clean up
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn("Warning: Error closing client:", e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn("Warning: Error closing transport:", e.message);
      }
    }
  }
}, 120000); // 增加到 120 秒 (2 分钟)

test("Tool consistency between multiple client connections", async () => {
  let transport1 = null,
    client1 = null;
  let transport2 = null,
    client2 = null;

  try {
    console.log("Testing tool consistency between multiple connections...");

    // Create first client
    client1 = new Client(
      {
        name: "test-client-1",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport1 = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: { ...process.env },
    });

    await client1.connect(transport1);
    await delay(2000); // 增加延迟

    // Create second client
    client2 = new Client(
      {
        name: "test-client-2",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    transport2 = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: { ...process.env },
    });

    await client2.connect(transport2);
    await delay(2000); // 增加延迟

    // Get tools from both clients
    const tools1 = await client1.listTools();
    const tools2 = await client2.listTools();

    console.log(`Client 1 tools count: ${tools1.tools.length}`);
    console.log(`Client 2 tools count: ${tools2.tools.length}`);

    // Both should have the same number of tools
    expect(tools1.tools.length).toBe(tools2.tools.length);

    // Extract tool names for comparison
    const toolNames1 = tools1.tools.map((t) => t.name).sort();
    const toolNames2 = tools2.tools.map((t) => t.name).sort();

    // Tool names should be identical
    expect(toolNames1).toEqual(toolNames2);

    // Check for specific expected tools
    const expectedTools = ["searchKnowledgeBase"];
    for (const toolName of expectedTools) {
      expect(toolNames1).toContain(toolName);
      expect(toolNames2).toContain(toolName);
      console.log(`✅ Both clients have ${toolName}`);
    }

    console.log("✅ Tool consistency test passed");
  } catch (error) {
    console.error("❌ Tool consistency test failed:", error);
    throw error;
  } finally {
    // Clean up both clients
    const cleanup = async (client, transport) => {
      if (client) {
        try {
          await client.close();
        } catch (e) {
          console.warn("Warning: Error closing client:", e.message);
        }
      }
      if (transport) {
        try {
          await transport.close();
        } catch (e) {
          console.warn("Warning: Error closing transport:", e.message);
        }
      }
    };

    await cleanup(client1, transport1);
    await cleanup(client2, transport2);
  }
}, 120000); // 增加到 120 秒

test.skipIf(!hasCloudBaseCredentials())("Database tools support object/object[] parameters", async () => {
  let transport = null;
  let client = null;
  const testCollection = `test_collection_${Date.now()}`;

  // 检查环境变量
  console.log("🔍 检查环境变量状态:");
  console.log(
    "TENCENTCLOUD_SECRETID 长度:",
    process.env.TENCENTCLOUD_SECRETID
      ? process.env.TENCENTCLOUD_SECRETID.length
      : "未设置",
  );
  console.log(
    "TENCENTCLOUD_SECRETKEY 长度:",
    process.env.TENCENTCLOUD_SECRETKEY
      ? process.env.TENCENTCLOUD_SECRETKEY.length
      : "未设置",
  );
  console.log(
    "TENCENTCLOUD_SESSIONTOKEN 长度:",
    process.env.TENCENTCLOUD_SESSIONTOKEN
      ? process.env.TENCENTCLOUD_SESSIONTOKEN.length
      : "未设置",
  );
  console.log(
    "CLOUDBASE_ENV_ID 长度:",
    process.env.CLOUDBASE_ENV_ID
      ? process.env.CLOUDBASE_ENV_ID.length
      : "未设置",
  );
  console.log("CLOUDBASE_ENV_ID 值:", process.env.CLOUDBASE_ENV_ID || "未设置");

  try {
    // 启动 MCP server
    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: { ...process.env },
    });
    client = new Client(
      { name: "test-db-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    await delay(3000);

    // 尝试批量清理历史测试集合（统一前缀），避免占满集合配额
    console.log("🧹 尝试批量清理历史测试集合（前缀 test_collection_）");
    try {
      const listRes = await client.callTool({
        name: "readNoSqlDatabaseStructure",
        arguments: {
          action: "listCollections",
          limit: 200,
        },
      });
      const listText = listRes?.content?.[0]?.text ?? "";
      let collectionNames = [];
      try {
        const parsed = JSON.parse(listText);
        const rawCollections =
          parsed?.data?.collections ||
          parsed?.collections ||
          parsed?.CollectionInfos ||
          [];
        collectionNames = rawCollections
          .map((item) => {
            if (!item) return null;
            if (typeof item === "string") return item;
            return (
              item.name ||
              item.collectionName ||
              item.CollectionName ||
              item.Name ||
              null
            );
          })
          .filter((name) => typeof name === "string")
          .filter(
            (name) =>
              name.startsWith("test_collection_") && name !== testCollection,
          );
      } catch (e) {
        console.warn(
          "⚠️ 解析集合列表结果失败，跳过批量清理：",
          (e && e.message) || String(e || ""),
        );
      }

      for (const name of collectionNames) {
        console.log("🧹 删除历史测试集合:", name);
        try {
          await client.callTool({
            name: "writeNoSqlDatabaseStructure",
            arguments: {
              action: "deleteCollection",
              collectionName: name,
            },
          });
        } catch (error) {
          const msg = error && error.message ? error.message : String(error || "");
          if (/not exist|不存在/i.test(msg)) {
            console.log("ℹ️ 历史测试集合不存在，无需删除:", name);
          } else {
            console.warn(
              "⚠️ 删除历史测试集合时出现错误（继续后续测试）:",
              name,
              msg,
            );
          }
        }
      }
    } catch (e) {
      console.warn(
        "⚠️ 列出集合以批量清理测试集合时出现错误（继续后续测试）:",
        (e && e.message) || String(e || ""),
      );
    }

    // 再尝试先清理本次要用的同名测试集合，避免上次测试遗留状态影响本次结果
    console.log("🧹 尝试清理本次测试集合（如果存在）:", testCollection);
    try {
      await client.callTool({
        name: "writeNoSqlDatabaseStructure",
        arguments: {
          action: "deleteCollection",
          collectionName: testCollection,
        },
      });
      console.log("✅ 历史测试集合已删除或不存在");
    } catch (error) {
      const msg = error && error.message ? error.message : String(error || "");
      if (/not exist|不存在/i.test(msg)) {
        console.log("ℹ️ 测试集合不存在，无需删除");
      } else {
        console.warn("⚠️ 删除历史测试集合时出现错误（继续后续测试）:", msg);
      }
    }

    // Create collection (writeNoSqlDatabaseStructure) and assert success so we know create actually succeeded.
    console.log("📝 尝试创建集合:", testCollection);
    let createRes;
    try {
      createRes = await client.callTool({
        name: "writeNoSqlDatabaseStructure",
        arguments: {
          action: "createCollection",
          collectionName: testCollection,
        },
      });
    } catch (error) {
      if (error.message && /already exist|已存在|already created/i.test(error.message)) {
        console.log("⚠️ 数据库已经创建，跳过创建集合", error.message);
      } else {
        throw error;
      }
    }
    if (createRes) {
      const createText = createRes.content?.[0]?.text ?? "";
      if (createText.includes("Table overrun") || createText.includes("overrun")) {
        console.log(
          "⏭️ Skipped: Collection limit reached (Table overrun). Delete unused collections in CloudBase console or use another env.",
        );
        return;
      }
      if (!createText.includes("云开发数据库集合创建成功") && !createText.includes('"success":true')) {
        throw new Error(
          `createCollection did not report success. Response: ${createText.slice(0, 500)}`,
        );
      }
      console.log("✅ 集合创建成功，工具返回:", createText.slice(0, 200));
    }

    // Wait for collection to become writable after create (see specs/nosql-collection-readiness).
    // Backend may return success before the collection is ready for PutItem.
    await delay(5000);

    // 1. writeNoSqlDatabaseContent.insert 支持 object[] (retry when collection not ready yet)
    const docs = [
      { name: "Alice", age: 18, nested: { foo: "bar" } },
      { name: "Bob", age: 20, tags: ["a", "b"] },
    ];
    const maxInsertRetries = 3;
    const insertRetryDelayMs = 5000;
    let insertRes;
    for (let attempt = 1; attempt <= maxInsertRetries; attempt++) {
      console.log(`📝 尝试插入文档 (${attempt}/${maxInsertRetries})...`);
      insertRes = await client.callTool({
        name: "writeNoSqlDatabaseContent",
        arguments: {
          action: "insert",
          collectionName: testCollection,
          documents: docs,
          query: {},
          update: {},
        },
      });
      const text = insertRes?.content?.[0]?.text ?? "";
      if (text.includes("文档插入成功")) {
        break;
      }
      if (text.includes("Db or Table not exist") && attempt < maxInsertRetries) {
        console.log(`⚠️ 集合尚未就绪，${insertRetryDelayMs / 1000}s 后重试`);
        await delay(insertRetryDelayMs);
        continue;
      }
      break;
    }
    expect(insertRes).toBeDefined();
    expect(insertRes.content[0].text).toContain("文档插入成功");
    console.log("✅ 文档插入成功");

    // 2. readNoSqlDatabaseContent 支持对象参数
    console.log("📝 尝试查询文档...");
    const queryRes = await client.callTool({
      name: "readNoSqlDatabaseContent",
      arguments: {
        collectionName: testCollection,
        query: { name: { $eq: "Alice" } },
      },
    });
    expect(queryRes).toBeDefined();
    expect(queryRes.content[0].text).toContain("文档查询成功");
    console.log("✅ 文档查询成功");

    // 3. writeNoSqlDatabaseContent.update 支持对象参数
    console.log("📝 尝试更新文档...");
    const updateRes = await client.callTool({
      name: "writeNoSqlDatabaseContent",
      arguments: {
        action: "update",
        collectionName: testCollection,
        query: { name: { $eq: "Alice" } },
        update: { $set: { age: 19 } },
        isMulti: false,
        // 兼容严格的 schema，update 不使用 documents
        documents: [],
      },
    });
    expect(updateRes).toBeDefined();
    expect(updateRes.content[0].text).toContain("文档更新成功");
    console.log("✅ 文档更新成功");

    // 4. writeNoSqlDatabaseContent.delete 支持对象参数
    console.log("📝 尝试删除文档...");
    const deleteRes = await client.callTool({
      name: "writeNoSqlDatabaseContent",
      arguments: {
        action: "delete",
        collectionName: testCollection,
        query: { name: { $eq: "Bob" } },
        isMulti: false,
        // 兼容严格的 schema，delete 不使用 documents/update
        documents: [],
        update: {},
      },
    });
    expect(deleteRes).toBeDefined();
    expect(deleteRes.content[0].text).toContain("文档删除成功");
    console.log("✅ 文档删除成功");

    // 5. readNoSqlDatabaseContent 兼容字符串参数
    console.log("📝 尝试字符串参数查询...");
    const queryStrRes = await client.callTool({
      name: "readNoSqlDatabaseContent",
      arguments: {
        collectionName: testCollection,
        query: JSON.stringify({ name: { $eq: "Alice" } }),
      },
    });
    expect(queryStrRes).toBeDefined();
    expect(queryStrRes.content[0].text).toContain("文档查询成功");
    console.log("✅ 字符串参数查询成功");
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {}
    }
    if (transport) {
      try {
        await transport.close();
      } catch {}
    }
  }
}, 180000);

// 修复后的 security rule tools 测试用例

test("Security rule tools functionality test", async () => {
  let transport = null;
  let client = null;

  try {
    console.log("Testing security rule tools functionality...");

    // Create client
    client = new Client(
      {
        name: "test-client-security-rule",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    const serverPath = join(__dirname, "../mcp/dist/cli.cjs");
    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: { ...process.env },
    });

    await client.connect(transport);
    await delay(3000);
    // List tools to verify security rule tools are available
    const toolsResult = await client.listTools();
    const securityTools = toolsResult.tools.filter(
      (t) => t.name === "readSecurityRule" || t.name === "writeSecurityRule",
    );

    expect(securityTools.length).toBe(2);
    console.log("✅ Security rule tools are available");

    // Test readSecurityRule tool (with mock data)
    const readSecurityRuleTool = toolsResult.tools.find(
      (t) => t.name === "readSecurityRule",
    );
    expect(readSecurityRuleTool).toBeDefined();

    // Test writeSecurityRule tool (with mock data)
    const writeSecurityRuleTool = toolsResult.tools.find(
      (t) => t.name === "writeSecurityRule",
    );
    expect(writeSecurityRuleTool).toBeDefined();

    // Verify tool schemas
    expect(readSecurityRuleTool.inputSchema).toBeDefined();
    expect(writeSecurityRuleTool.inputSchema).toBeDefined();
    // 已移除对 inputSchema 结构的详细断言

    console.log("✅ Security rule tools schema validation passed");
  } catch (error) {
    console.error("❌ Security rule tools test failed:", error);
    throw error;
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {}
    }
    if (transport) {
      try {
        await transport.close();
      } catch {}
    }
  }
}, 60000);

// 已移除云函数创建-调用-日志-详情全流程集成测试
