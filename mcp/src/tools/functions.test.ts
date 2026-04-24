import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFunctionOperationErrorMessage,
  DEFAULT_RUNTIME,
  registerFunctionTools,
  resolveEventFunctionRuntime,
  shouldInstallDependencyForFunction,
} from "./functions.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockCreateFunction,
  mockCreateAccess,
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockIsCloudMode,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn(),
  mockCreateAccess: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockIsCloudMode: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

vi.mock("../utils/cloud-mode.js", () => ({
  isCloudMode: mockIsCloudMode,
}));

vi.mock("../utils/logger.js", () => ({
  debug: vi.fn(),
}));

function createMockServer() {
  const tools: Record<
    string,
    {
      meta: any;
      handler: (args: any) => Promise<any>;
    }
  > = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerFunctionTools(server);

  return { tools };
}

describe("functions tool helpers", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCloudMode.mockReturnValue(false);
    mockCreateFunction.mockResolvedValue({
      RequestId: "req-create-function",
      FunctionName: "httpDemo",
    });
    mockCreateAccess.mockResolvedValue({
      RequestId: "req-create-access",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      functions: {
        createFunction: mockCreateFunction,
      },
      access: {
        createAccess: mockCreateAccess,
      },
    });

    ({ tools } = createMockServer());
  });

  it("keeps HTTP functions from forcing dependency install when package.json is absent", () => {
    expect(shouldInstallDependencyForFunction("HTTP", false)).toBe(false);
    expect(shouldInstallDependencyForFunction("HTTP", true)).toBe(true);
  });

  it("returns a clearer HTTP path hint for undefined paths[0] failures", () => {
    const message = buildFunctionOperationErrorMessage(
      "createFunction",
      "httpDemo",
      "/tmp/project/cloudfunctions",
      new Error('[createFunction] The "paths[0]" argument must be of type string. Received undefined'),
    );

    expect(message).toContain("functionRootPath");
    expect(message).toContain("zipFile");
  });

  it("adds dependency-install guidance for HTTP function failures", () => {
    const message = buildFunctionOperationErrorMessage(
      "createFunction",
      "httpDemo",
      "/tmp/project/cloudfunctions",
      new Error("[httpDemo] 函数代码更新失败：云函数创建失败\n状态描述: 依赖安装失败"),
    );

    expect(message).toContain("原生 Node.js API");
    expect(message).toContain("package.json");
  });

  it("normalizes supported Event runtimes with whitespace", () => {
    expect(resolveEventFunctionRuntime("Python 3.9")).toBe("Python3.9");
    expect(resolveEventFunctionRuntime("Php 7.4")).toBe("Php7.4");
  });

  it("falls back to the default runtime when Event runtime is omitted", () => {
    expect(resolveEventFunctionRuntime(undefined)).toBe(DEFAULT_RUNTIME);
  });

  it("rejects unsupported Event runtimes with a helpful message", () => {
    expect(() => resolveEventFunctionRuntime("Ruby3.2")).toThrow(/不支持的运行时环境/);
    expect(() => resolveEventFunctionRuntime("Ruby3.2")).toThrow(/Python3.9/);
  });

  it("rejects Event-style handler input for HTTP createFunction", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "httpDemo",
        type: "HTTP",
        runtime: "Nodejs18.15",
        handler: "index.main",
      },
      functionRootPath: "/tmp/cloudfunctions",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("默认不要传 func.handler");
    expect(payload.message).toContain("scf_bootstrap");
    expect(mockCreateFunction).not.toHaveBeenCalled();
  });

  it("fails fast when local HTTP function directory lacks scf_bootstrap", async () => {
    const functionRootPath = mkdtempSync(path.join(os.tmpdir(), "http-fn-"));
    const functionDir = path.join(functionRootPath, "httpDemo");
    mkdirSync(functionDir);
    writeFileSync(
      path.join(functionDir, "package.json"),
      JSON.stringify({ name: "httpDemo", version: "1.0.0" }),
    );

    try {
      const result = await tools.manageFunctions.handler({
        action: "createFunction",
        func: {
          name: "httpDemo",
          type: "HTTP",
          runtime: "Nodejs18.15",
        },
        functionRootPath,
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload.success).toBe(false);
      expect(payload.message).toContain("必须包含 scf_bootstrap");
      expect(mockCreateFunction).not.toHaveBeenCalled();
    } finally {
      rmSync(functionRootPath, { recursive: true, force: true });
    }
  });

  it("allows Event functions with handler", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "eventDemo",
        type: "Event",
        handler: "index.main",
      },
      functionRootPath: "/tmp/cloudfunctions",
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
  });

  it("guides HTTP functions through runtime verification and anonymous-access follow-up without auto-creating gateway access", async () => {
    const functionRootPath = mkdtempSync(path.join(os.tmpdir(), "http-fn-"));
    const functionDir = path.join(functionRootPath, "httpDemo");
    mkdirSync(functionDir);
    writeFileSync(path.join(functionDir, "index.js"), "require('node:http').createServer(() => {}).listen(9000);\n");
    writeFileSync(path.join(functionDir, "scf_bootstrap"), "#!/bin/sh\nnode index.js\n");
    chmodSync(path.join(functionDir, "scf_bootstrap"), 0o755);

    try {
      const result = await tools.manageFunctions.handler({
        action: "createFunction",
        func: {
          name: "httpDemo",
          type: "HTTP",
          runtime: "Nodejs18.15",
        },
        functionRootPath,
      });

      const payload = JSON.parse(result.content[0].text);

      expect(mockCreateFunction).toHaveBeenCalledWith({
        func: expect.objectContaining({
          name: "httpDemo",
          type: "HTTP",
          installDependency: false,
        }),
        functionRootPath,
        force: false,
      });
      expect(mockCreateAccess).not.toHaveBeenCalled();
      expect(payload.message).toContain("queryFunctions(action=\"listFunctionLogs\"");
      expect(payload.message).toContain("FUNCTION_EXECUTE_FAIL");
      expect(payload.message).toContain("匿名身份访问");
      expect(payload.message).toContain("EXCEED_AUTHORITY");
      expect(payload.nextActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: "queryFunctions",
            action: "listFunctionLogs",
          }),
          expect.objectContaining({
            tool: "manageGateway",
            action: "createAccess",
          }),
          expect.objectContaining({
            tool: "queryPermissions",
            action: "getResourcePermission",
          }),
          expect.objectContaining({
            tool: "managePermissions",
            action: "updateResourcePermission",
          }),
        ]),
      );
    } finally {
      rmSync(functionRootPath, { recursive: true, force: true });
    }
  });
});
