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
  mockUpdateFunctionCode,
  mockCreateAccess,
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockIsCloudMode,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn(),
  mockUpdateFunctionCode: vi.fn(),
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
    mockUpdateFunctionCode.mockResolvedValue({
      RequestId: "req-update-code",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      functions: {
        createFunction: mockCreateFunction,
        updateFunctionCode: mockUpdateFunctionCode,
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

  it("warns when functionRootPath looks like project root on path-not-found errors", () => {
    const message = buildFunctionOperationErrorMessage(
      "createFunction",
      "hello",
      "/home/user/my-project",
      new Error("路径不存在"),
    );

    expect(message).toContain("functionRootPath");
    expect(message).toContain("cloudfunctions");
    expect(message).toContain("functions");
    expect(message).toContain("/home/user/my-project/cloudfunctions");
    expect(message).toContain("/home/user/my-project/functions");
  });

  it("does not warn about project root when functionRootPath already ends with cloudfunctions", () => {
    const message = buildFunctionOperationErrorMessage(
      "createFunction",
      "hello",
      "/home/user/my-project/cloudfunctions",
      new Error("路径不存在"),
    );

    expect(message).not.toContain("functionRootPath 应该是直接包含函数文件夹的目录");
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

  it("guides HTTP functions through anonymous-access follow-up without auto-creating gateway access", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "httpDemo",
        type: "HTTP",
        runtime: "Nodejs18.15",
      },
      functionRootPath: "/tmp/cloudfunctions",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateFunction).toHaveBeenCalledWith({
      func: expect.objectContaining({
        name: "httpDemo",
        type: "HTTP",
        installDependency: false,
      }),
      functionRootPath: "/tmp/cloudfunctions",
      force: false,
    });
    expect(mockCreateAccess).not.toHaveBeenCalled();
    expect(payload.message).toContain("manageGateway(action=\"createAccess\")");
    expect(payload.message).toContain("type=\"HTTP\"");
    expect(payload.message).toContain("匿名身份访问");
    expect(payload.message).toContain("EXCEED_AUTHORITY");
    expect(payload.nextActions).toEqual(
      expect.arrayContaining([
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
  });

  it("creates a CustomImage HTTP function via image deploy mode", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "imageDemo",
        type: "HTTP",
        runtime: "CustomImage",
      },
      imageConfig: {
        imageType: "enterprise",
        imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001",
        registryId: "tcr-xxxxxxxx",
        command: "python",
        args: "-u app.py",
        imagePort: 9000,
      },
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        deployMode: "image",
        func: expect.objectContaining({
          name: "imageDemo",
          runtime: "CustomImage",
          imageConfig: expect.objectContaining({
            imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001",
            registryId: "tcr-xxxxxxxx",
          }),
        }),
      }),
    );
    // 镜像部署不得携带本地代码安装依赖标志
    const createArg = mockCreateFunction.mock.calls[0][0];
    expect(createArg.func.installDependency).toBeUndefined();
    expect(createArg.functionRootPath).toBeUndefined();
    expect(payload.success).toBe(true);
    expect(payload.data.deployMode).toBe("image");
    expect(payload.data.imageUri).toBe(
      "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001",
    );
  });

  it("requires imageUri for image deploy", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: { name: "imageDemo", type: "HTTP", runtime: "CustomImage" },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("imageUri");
    expect(mockCreateFunction).not.toHaveBeenCalled();
  });

  it("requires registryId for enterprise image type", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: { name: "imageDemo", type: "HTTP", runtime: "CustomImage" },
      imageConfig: {
        imageType: "enterprise",
        imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001",
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("registryId");
    expect(mockCreateFunction).not.toHaveBeenCalled();
  });

  it("updates a function image via updateFunctionCode image deploy mode", async () => {
    const result = await tools.manageFunctions.handler({
      action: "updateFunctionCode",
      functionName: "imageDemo",
      imageConfig: {
        imageType: "enterprise",
        imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-002",
        registryId: "tcr-xxxxxxxx",
      },
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockUpdateFunctionCode).toHaveBeenCalledWith(
      expect.objectContaining({
        deployMode: "image",
        func: expect.objectContaining({
          name: "imageDemo",
          imageConfig: expect.objectContaining({
            imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-002",
          }),
        }),
      }),
    );
    expect(payload.success).toBe(true);
    expect(payload.data.deployMode).toBe("image");
    expect(payload.data.imageUri).toBe(
      "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-002",
    );
  });

  it("allows image deploy in cloud mode (no local code dependency)", async () => {
    mockIsCloudMode.mockReturnValue(true);

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: { name: "imageDemo", type: "HTTP", runtime: "CustomImage" },
      imageConfig: {
        imageType: "personal",
        imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-001",
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockCreateFunction).toHaveBeenCalled();
  });
});
