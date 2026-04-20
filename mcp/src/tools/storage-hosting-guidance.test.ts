import { describe, expect, it, vi } from "vitest";
import { registerHostingTools } from "./hosting.js";
import { registerStorageTools } from "./storage.js";
import type { ExtendedMcpServer } from "../server.js";

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    ide: "TestIDE",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
    server: {
      sendLoggingMessage: vi.fn(),
    },
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerHostingTools(server);
  registerStorageTools(server);

  return tools;
}

describe("storage and hosting tool guidance", () => {
  it("should clearly separate static hosting uploads from cloud storage uploads", () => {
    const tools = createMockServer();

    expect(tools.uploadFiles.meta.description).toContain("仅用于 Web 站点部署");
    expect(tools.uploadFiles.meta.description).toContain("manageStorage");
    expect(tools.uploadFiles.meta.description).toContain("通常不需要调用此工具");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("云存储对象路径请改用 manageStorage");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("可带或不带前导 /");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("/ 表示托管根目录");
    expect(tools.manageStorage.meta.description).toContain("仅用于 COS/Storage 对象");
    expect(tools.manageStorage.meta.description).toContain("不用于静态网站托管");
  });
});
