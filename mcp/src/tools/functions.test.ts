import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCreateLayerNameWarning,
  buildFunctionOperationErrorMessage,
  DEFAULT_RUNTIME,
  LAYER_SOFT_WARN,
  layerNameIncludesEnvId,
  pickManageFunctionName,
  registerFunctionTools,
  resolveEventFunctionRuntime,
  shouldInstallDependencyForFunction,
} from "./functions.js";
import { FUNCTION_IMAGE_CONFIG_COMMON_FIELDS } from "./function-deploy-schema.js";
import {
  FUNCTION_UPDATING_ERROR_CODE,
  FUNCTION_UPDATING_RETRY_AFTER_SECONDS,
  functionUpdatingRuntime,
} from "./function-updating.js";
import type { ExtendedMcpServer } from "../server.js";

const personalCredential = {
  username: "100000000001",
  password: "test-password",
};
const {
  mockCreateFunction,
  mockUpdateFunctionCode,
  mockUpdateFunctionConfig,
  mockGetFunctionDetail,
  mockCreateAccess,
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockIsCloudMode,
  mockCheckDeployConfig,
  mockDeployFunction,
  mockProbeCamCapabilityForLogin,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn(),
  mockUpdateFunctionCode: vi.fn(),
  mockUpdateFunctionConfig: vi.fn(),
  mockGetFunctionDetail: vi.fn(),
  mockCreateAccess: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockIsCloudMode: vi.fn(),
  mockCheckDeployConfig: vi.fn(),
  mockDeployFunction: vi.fn(),
  mockProbeCamCapabilityForLogin: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
  probeCamCapabilityForLogin: mockProbeCamCapabilityForLogin,
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
  const originalSleep = functionUpdatingRuntime.sleep;

  beforeEach(() => {
    vi.clearAllMocks();
    functionUpdatingRuntime.sleep = async () => undefined;
    // 凭证环境变量会影响镜像部署用例，逐个用例自行设置，默认必须干净
    delete process.env.TCB_TCR_USERNAME;
    delete process.env.TCB_TCR_PASSWORD;
    mockIsCloudMode.mockReturnValue(false);
    mockGetEnvId.mockResolvedValue("env-test");
    // 默认登录态可用；需要验证 CAM 前置拦截的用例自行改成 "limited"
    mockProbeCamCapabilityForLogin.mockResolvedValue("capable");
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
    mockUpdateFunctionConfig.mockResolvedValue({
      RequestId: "req-update-config",
    });
    mockGetFunctionDetail.mockResolvedValue({
      Status: "Active",
      Timeout: 20,
      Environment: { Variables: [] },
      VpcConfig: {},
    });
    mockCheckDeployConfig.mockReturnValue({ ready: true, checks: [] });
    mockDeployFunction.mockResolvedValue({
      functionName: "http-image-demo",
      functionType: "HTTP",
      requestedStrategy: "image",
      effectiveStrategy: "image",
      action: "create",
      operations: ["deploy-function"],
      dryRun: true,
      steps: [{ stage: "done", status: "success" }],
      warnings: [],
      plan: { action: "create", operations: ["deploy-function"] },
    });
    mockGetCloudBaseManager.mockResolvedValue({
      functions: {
        createFunction: mockCreateFunction,
        updateFunctionCode: mockUpdateFunctionCode,
        updateFunctionConfig: mockUpdateFunctionConfig,
        getFunctionDetail: mockGetFunctionDetail,
      },
      functionDeployer: {
        checkConfig: mockCheckDeployConfig,
        deployFunction: mockDeployFunction,
      },
      access: {
        createAccess: mockCreateAccess,
      },
    });

    ({ tools } = createMockServer());
  });

  afterEach(() => {
    functionUpdatingRuntime.sleep = originalSleep;
    delete process.env.TCB_TCR_USERNAME;
    delete process.env.TCB_TCR_PASSWORD;
  });

  it("soft-warns bare layer names and accepts env-suffixed names", () => {
    const envId = "cloud1-d9ghadgak3edf6b36";
    expect(layerNameIncludesEnvId("common", envId)).toBe(false);
    expect(layerNameIncludesEnvId(`common_${envId}`, envId)).toBe(true);
    expect(buildCreateLayerNameWarning("common", envId)).toBe(
      LAYER_SOFT_WARN.createNameFormat(envId),
    );
    expect(buildCreateLayerNameWarning(`common_${envId}`, envId)).toBeUndefined();
  });

  it("documents fixed layer naming format in manageFunctions description", () => {
    const description = tools.manageFunctions.meta.description as string;
    expect(description).toContain("{layerName}_{当前envId}");
    expect(description).toContain("common_cloud1-d9ghadgak3edf6b36");
    expect(description).toContain("SCF 账号级共享命名空间");
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
    expect(payload.message).toContain("manageGateway(action=\"createRoute\")");
    expect(payload.message).toContain("upstreamResourceType=\"WEB_SCF\"");
    expect(payload.message).toContain("WEB_SCF");
    expect(payload.message).toContain("匿名身份访问");
    expect(payload.message).toContain("EXCEED_AUTHORITY");
    expect(payload.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "manageGateway",
          action: "createRoute",
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

  it("maps createFunction cloud buildStrategy to functionDeployer dry-run", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-cloud-demo",
            namespace: "demo",
            repository: "http-cloud-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    // func 的镜像/构建字段原样透传给 functionDeployer，runtime/imagePort 默认值由 SDK 补齐。
    expect(mockCheckDeployConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: expect.objectContaining({
          imageType: "personal",
          build: expect.objectContaining({
            cwd: "/workspace/functions/http-cloud-demo",
          }),
        }),
      }),
    );
    expect(mockDeployFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        buildStrategy: "cloud",
        imageConfig: expect.objectContaining({ imageType: "personal" }),
      }),
      expect.objectContaining({
        dryRun: true,
        autoGrant: false,
        onProgress: expect.any(Function),
      }),
    );
  });

  it("starts a confirmed deployment asynchronously and exposes task status", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      wait: false,
      confirm: true,
      func: {
        name: "http-async-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-async-demo",
            namespace: "demo",
            repository: "http-async-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.taskId).toEqual(expect.any(String));
    expect(payload.data.status).toBe("running");
    expect(payload.message).toContain("异步镜像部署任务");
    expect(mockDeployFunction).toHaveBeenCalledWith(
      expect.objectContaining({ buildStrategy: "cloud" }),
      expect.objectContaining({ dryRun: false, autoGrant: false }),
    );

    const statusResult = await tools.queryFunctions.handler({
      action: "getFunctionDeployStatus",
      taskId: payload.data.taskId,
    });
    const statusPayload = JSON.parse(statusResult.content[0].text);
    expect(statusPayload.success).toBe(true);
    expect(statusPayload.data.taskId).toBe(payload.data.taskId);
    expect(["running", "succeeded"]).toContain(statusPayload.data.status);
  });

  it("rejects status lookup for an unknown deployment task", async () => {
    const result = await tools.queryFunctions.handler({
      action: "getFunctionDeployStatus",
      taskId: "missing-task",
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("未找到部署任务");
  });

  it("exposes buildStrategy as an enum on the func Inspector schema", () => {
    const funcSchema = tools.manageFunctions.meta.inputSchema.func;
    expect(funcSchema).toBeDefined();
    const buildStrategy = funcSchema.unwrap().shape.buildStrategy;
    expect(buildStrategy).toBeDefined();
    expect(buildStrategy.unwrap()._def.typeName).toBe("ZodEnum");
    expect(buildStrategy.unwrap()._def.values).toEqual([
      "zip",
      "cloud",
      "local",
      "image",
    ]);
  });
  it("rejects real deploy without explicit confirmation", async () => {
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-cloud-demo",
            namespace: "demo",
            repository: "http-cloud-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("confirm=true");
    expect(mockDeployFunction).not.toHaveBeenCalled();
  });

  it("executes a confirmed cloud deployment with default autoGrant", async () => {
    mockDeployFunction.mockResolvedValueOnce({
      functionName: "http-cloud-demo",
      functionType: "HTTP",
      requestedStrategy: "cloud",
      effectiveStrategy: "cloud",
      action: "create",
      operations: ["create-function"],
      dryRun: false,
      buildId: "build-456",
      imageUri: "demo.tencentcloudcr.com/team/http-cloud-demo:v1",
      gatewayUrl: "https://example.com/functions/http-cloud-demo",
      steps: [
        { stage: "build", status: "success" },
        { stage: "deploy-function", status: "success" },
      ],
      warnings: [],
    });

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-cloud-demo",
            namespace: "demo",
            repository: "http-cloud-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.message).toContain("部署成功");
    expect(mockDeployFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        buildStrategy: "cloud",
        imageConfig: expect.objectContaining({ imageType: "personal" }),
      }),
      expect.objectContaining({
        dryRun: false,
        autoGrant: false,
        onProgress: expect.any(Function),
      }),
    );
  });

  it("executes a confirmed personal local deployment in local mode", async () => {
    mockDeployFunction.mockResolvedValueOnce({
      functionName: "http-local-demo",
      functionType: "HTTP",
      requestedStrategy: "local",
      effectiveStrategy: "local",
      action: "create",
      operations: ["create-function"],
      dryRun: false,
      imageUri: "ccr.ccs.tencentyun.com/demo/http-local-demo:v1",
      steps: [
        { stage: "login", status: "success" },
        { stage: "build", status: "success" },
        { stage: "push", status: "success" },
        { stage: "deploy-function", status: "success" },
      ],
      warnings: [],
    });

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-local-demo",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-local-demo",
            repository: "ccr.ccs.tencentyun.com/demo/http-local-demo",
            tag: "v1",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockDeployFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        buildStrategy: "local",
        imageConfig: expect.objectContaining({
          imageType: "personal",
          build: expect.objectContaining({
            cwd: "/workspace/functions/http-local-demo",
            repository: "ccr.ccs.tencentyun.com/demo/http-local-demo",
            tag: "v1",
            registryCredential: personalCredential,
          }),
        }),
      }),
      expect.objectContaining({
        dryRun: false,
        autoGrant: false,
        onProgress: expect.any(Function),
      }),
    );
  });

  it("fills personal registry credential from TCB_TCR_* env when omitted from args", async () => {
    process.env.TCB_TCR_USERNAME = "100012345678";
    process.env.TCB_TCR_PASSWORD = "env-only-secret";

    await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "http-env-cred",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          // 请求参数里完全没有 registryCredential
          build: { cwd: "/workspace/functions/http-env-cred" },
        },
      },
    });

    expect(mockCheckDeployConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        imageConfig: expect.objectContaining({
          build: expect.objectContaining({
            registryCredential: {
              username: "100012345678",
              password: "env-only-secret",
            },
          }),
        }),
      }),
    );
  });

  it("lets an explicit credential argument win over the environment", async () => {
    process.env.TCB_TCR_USERNAME = "100000000000";
    process.env.TCB_TCR_PASSWORD = "env-secret";

    await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "http-arg-cred",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-arg-cred",
            registryCredential: personalCredential,
          },
        },
      },
    });

    expect(mockCheckDeployConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        imageConfig: expect.objectContaining({
          build: expect.objectContaining({
            registryCredential: personalCredential,
          }),
        }),
      }),
    );
  });

  it("does not inject TCR credential for the enterprise image type", async () => {
    process.env.TCB_TCR_USERNAME = "100012345678";
    process.env.TCB_TCR_PASSWORD = "env-secret";

    await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "http-enterprise",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "enterprise",
          build: {
            cwd: "/workspace/functions/http-enterprise",
            registryId: "tcr-abcd1234",
          },
        },
      },
    });

    // 企业版走实例临时令牌，不需要也不应注入个人版固定密码
    const config = mockCheckDeployConfig.mock.calls.at(-1)?.[0] as any;
    expect(config.imageConfig.build.registryCredential).toBeUndefined();
  });

  it("does not read TCR credential from process env in cloud mode", async () => {
    mockIsCloudMode.mockReturnValue(true);
    process.env.TCB_TCR_USERNAME = "100012345678";
    process.env.TCB_TCR_PASSWORD = "env-secret";

    // cloud mode 是多租户共享进程，进程环境变量属于部署方而非调用方
    await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: true,
      func: {
        name: "http-cloud-mode",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: { cwd: "/workspace/functions/http-cloud-mode" },
        },
      },
    });

    const config = mockCheckDeployConfig.mock.calls.at(-1)?.[0] as any;
    expect(config.imageConfig.build.registryCredential).toBeUndefined();
  });

  it("guides towards env vars without echoing secrets when credential check fails", async () => {
    mockCheckDeployConfig.mockReturnValueOnce({
      ready: false,
      checks: [
        {
          code: "CLOUD_REGISTRY_CREDENTIAL_MISSING",
          status: "fail",
          message: "个人版 TCR 构建缺少推送凭证",
        },
      ],
    });

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      func: {
        name: "http-missing-cred",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: { cwd: "/workspace/functions/http-missing-cred" },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.errorCode).toBe("CONFIG_INVALID");
    expect(payload.message).toContain("TCB_TCR_USERNAME");
    expect(payload.message).toContain("TCB_TCR_PASSWORD");
    expect(payload.message).toContain("不要向用户索要密码明文");
  });

  it("executes a confirmed enterprise cloud deployment with explicit autoGrant", async () => {
    mockDeployFunction.mockResolvedValueOnce({
      functionName: "http-cloud-demo",
      functionType: "HTTP",
      requestedStrategy: "cloud",
      effectiveStrategy: "cloud",
      action: "create",
      operations: ["create-function"],
      dryRun: false,
      buildId: "build-123",
      imageUri: "demo.tencentcloudcr.com/team/http-cloud-demo:v1",
      steps: [
        { stage: "upload", status: "success" },
        { stage: "build", status: "success" },
        { stage: "deploy-function", status: "success" },
      ],
      warnings: [],
    });

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      autoGrant: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "enterprise",
          build: {
            cwd: "/workspace/functions/http-cloud-demo",
            registryId: "tcr-12345678",
            repository: "demo.tencentcloudcr.com/team/http-cloud-demo",
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockDeployFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        buildStrategy: "cloud",
        imageConfig: expect.objectContaining({
          imageType: "enterprise",
          build: expect.objectContaining({
            cwd: "/workspace/functions/http-cloud-demo",
            registryId: "tcr-12345678",
            repository: "demo.tencentcloudcr.com/team/http-cloud-demo",
          }),
        }),
      }),
      expect.objectContaining({
        dryRun: false,
        autoGrant: true,
        onProgress: expect.any(Function),
      }),
    );
  });

  it("blocks a real enterprise cloud build when the login state has no CAM permission", async () => {
    // 环境级 API Key / OAuth STS 不带 CAM 策略，无法铸造企业版 TCR 临时令牌
    mockProbeCamCapabilityForLogin.mockResolvedValue("limited");

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "enterprise",
          registryId: "tcr-12345678",
          build: { cwd: "/workspace/functions/http-cloud-demo" },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("CAM");
    // 前置拦截的意义就在于根本不发起部署，而不是让它跑到一半再失败
    expect(mockDeployFunction).not.toHaveBeenCalled();
  });

  it("infers enterprise from registryId and blocks a CAM-limited local build", async () => {
    // SDK 契约：省略 imageType 时由 registryId 推断为 enterprise
    mockProbeCamCapabilityForLogin.mockResolvedValue("limited");

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-local-demo",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          registryId: "tcr-12345678",
          build: { cwd: "/workspace/functions/http-local-demo" },
        },
      },
    });

    expect(JSON.parse(result.content[0].text).success).toBe(false);
    expect(mockDeployFunction).not.toHaveBeenCalled();
  });

  it("does not run the CAM preflight for a personal-registry build", async () => {
    // 个人版走静态密码直接 docker login，不经过 CAM，不该被拦
    mockProbeCamCapabilityForLogin.mockResolvedValue("limited");
    mockDeployFunction.mockResolvedValueOnce({
      functionName: "http-personal-demo",
      functionType: "HTTP",
      requestedStrategy: "cloud",
      effectiveStrategy: "cloud",
      action: "create",
      operations: ["create-function"],
      dryRun: false,
      steps: [],
      warnings: [],
    });

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-personal-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/functions/http-personal-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    expect(JSON.parse(result.content[0].text).success).toBe(true);
    expect(mockProbeCamCapabilityForLogin).not.toHaveBeenCalled();
    expect(mockDeployFunction).toHaveBeenCalled();
  });

  it("does not run the CAM preflight for a dry-run", async () => {
    mockProbeCamCapabilityForLogin.mockResolvedValue("limited");

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "enterprise",
          registryId: "tcr-12345678",
          build: { cwd: "/workspace/functions/http-cloud-demo" },
        },
      },
    });

    expect(JSON.parse(result.content[0].text).success).toBe(true);
    expect(mockProbeCamCapabilityForLogin).not.toHaveBeenCalled();
  });

  it("lets an inconclusive CAM probe through instead of blocking the deployment", async () => {
    // 超时/网络失败归为 unknown；据此拦截会误伤正常用户
    mockProbeCamCapabilityForLogin.mockResolvedValue("unknown");
    mockDeployFunction.mockResolvedValueOnce({
      functionName: "http-cloud-demo",
      functionType: "HTTP",
      requestedStrategy: "cloud",
      effectiveStrategy: "cloud",
      action: "create",
      operations: ["create-function"],
      dryRun: false,
      steps: [],
      warnings: [],
    });

    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "enterprise",
          registryId: "tcr-12345678",
          build: { cwd: "/workspace/functions/http-cloud-demo" },
        },
      },
    });

    expect(JSON.parse(result.content[0].text).success).toBe(true);
    expect(mockDeployFunction).toHaveBeenCalled();
  });

  it("allows cloud strategy dry-run in cloud mode", async () => {
    mockIsCloudMode.mockReturnValue(true);
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/http-cloud-demo",
            namespace: "demo",
            repository: "http-cloud-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockDeployFunction).toHaveBeenCalledWith(
      expect.objectContaining({ buildStrategy: "cloud" }),
      expect.objectContaining({ dryRun: true, autoGrant: false }),
    );
  });

  it("rejects local strategy in cloud mode", async () => {
    mockIsCloudMode.mockReturnValue(true);
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: true,
      func: {
        name: "http-local-demo",
        type: "HTTP",
        buildStrategy: "local",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/http-local-demo",
            repository: "ccr.ccs.tencentyun.com/demo/http-local-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("buildStrategy=local");
    expect(mockDeployFunction).not.toHaveBeenCalled();
  });

  it("rejects real cloud deployment in cloud mode", async () => {
    mockIsCloudMode.mockReturnValue(true);
    const result = await tools.manageFunctions.handler({
      action: "createFunction",
      dryRun: false,
      confirm: true,
      func: {
        name: "http-cloud-demo",
        type: "HTTP",
        buildStrategy: "cloud",
        imageConfig: {
          imageType: "personal",
          build: {
            cwd: "/workspace/http-cloud-demo",
            namespace: "demo",
            repository: "http-cloud-demo",
            registryCredential: personalCredential,
          },
        },
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("读取并打包本地构建上下文");
    expect(mockDeployFunction).not.toHaveBeenCalled();
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

  it("protocolType schema should only accept WS (reject HTTP)", async () => {
    const schema = tools.manageFunctions.meta.inputSchema;
    const protocolType = schema.func.unwrap().shape.protocolType;

    expect(protocolType.unwrap()._def.values).toEqual(["WS"]);
    expect(protocolType.safeParse("WS").success).toBe(true);
    expect(protocolType.safeParse("HTTP").success).toBe(false);
    expect(protocolType.description).toContain("WS");
    expect(protocolType.description).toContain("WebSocket");
  });

  it("falls back to func.name when top-level functionName is missing", () => {
    expect(pickManageFunctionName({ functionName: "top" })).toBe("top");
    expect(pickManageFunctionName({ func: { name: "nested" } })).toBe("nested");
    expect(
      pickManageFunctionName({ functionName: "top", func: { name: "nested" } }),
    ).toBe("top");
  });

  it("accepts updateFunctionCode when name is only provided via func.name", async () => {
    const result = await tools.manageFunctions.handler({
      action: "updateFunctionCode",
      func: { name: "imageDemo" },
      imageConfig: {
        imageType: "personal",
        imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-003",
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockUpdateFunctionCode).toHaveBeenCalledWith(
      expect.objectContaining({
        deployMode: "image",
        func: expect.objectContaining({ name: "imageDemo" }),
      }),
    );
  });

  it("guides updateFunctionConfig when Status stays Updating instead of throwing raw SCF copy", async () => {
    mockGetFunctionDetail.mockResolvedValue({
      Status: "Updating",
      Timeout: 20,
      Environment: { Variables: [] },
      VpcConfig: {},
    });

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "hello",
      timeout: 30,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.errorCode).toBe(FUNCTION_UPDATING_ERROR_CODE);
    expect(payload.retryAfterSeconds).toBe(FUNCTION_UPDATING_RETRY_AFTER_SECONDS);
    expect(payload.message).toContain("不要立即重试");
    expect(payload.message).toContain("getFunctionDetail");
    expect(payload.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "queryFunctions",
          action: "getFunctionDetail",
        }),
        expect.objectContaining({
          tool: "manageFunctions",
          action: "updateFunctionConfig",
        }),
      ]),
    );
    expect(mockUpdateFunctionConfig).not.toHaveBeenCalled();
  });

  it("returns nextActions when UpdateFunctionConfiguration reports Updating after Status was Active", async () => {
    mockUpdateFunctionConfig.mockRejectedValue(
      new Error("[scf/UpdateFunctionConfiguration] 当前函数处于 Updating"),
    );

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "hello",
      envVariables: { FOO: "bar" },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.errorCode).toBe(FUNCTION_UPDATING_ERROR_CODE);
    expect(payload.message).toContain("当前函数处于 Updating");
    expect(payload.message).not.toBe(
      "[scf/UpdateFunctionConfiguration] 当前函数处于 Updating",
    );
    expect(payload.nextActions[0]).toMatchObject({
      tool: "queryFunctions",
      action: "getFunctionDetail",
    });
    expect(mockUpdateFunctionConfig).toHaveBeenCalledTimes(1);
  });

  it("returns Updating guidance for updateFunctionCode instead of only wrapping the SCF message", async () => {
    mockUpdateFunctionCode.mockRejectedValue(
      new Error("[scf/UpdateFunctionCode] 当前函数处于 Updating"),
    );

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionCode",
      functionName: "imageDemo",
      imageConfig: {
        imageType: "personal",
        imageUri: "ccr.ccs.tencentyun.com/your-ns/demo-app:demo-app-004",
      },
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.errorCode).toBe(FUNCTION_UPDATING_ERROR_CODE);
    expect(payload.message).toContain("不要立即重试");
    expect(payload.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "manageFunctions",
          action: "updateFunctionCode",
        }),
      ]),
    );
  });

  it("adds Updating wait guidance on wrapped create/update code errors", () => {
    const message = buildFunctionOperationErrorMessage(
      "updateFunctionCode",
      "hello",
      "/tmp/cloudfunctions",
      new Error("[scf/UpdateFunctionCode] 当前函数处于 Updating"),
    );

    expect(message).toContain("Updating");
    expect(message).toContain("getFunctionDetail");
    expect(message).toContain("不要立即重试");
  });

  it("updates function config when Status is Active", async () => {
    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "hello",
      timeout: 60,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockUpdateFunctionConfig).toHaveBeenCalledTimes(1);
    expect(payload.message).toContain("hello");
  });

  it("retries updateFunctionConfig after Status leaves Updating within the wait budget", async () => {
    mockGetFunctionDetail
      .mockResolvedValueOnce({
        Status: "Updating",
        Timeout: 20,
        Environment: { Variables: [] },
        VpcConfig: {},
      })
      .mockResolvedValueOnce({
        Status: "Updating",
        Timeout: 20,
        Environment: { Variables: [] },
        VpcConfig: {},
      })
      .mockResolvedValue({
        Status: "Active",
        Timeout: 20,
        Environment: { Variables: [] },
        VpcConfig: {},
      });

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "hello",
      timeout: 30,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(mockUpdateFunctionConfig).toHaveBeenCalledTimes(1);
    expect(mockGetFunctionDetail.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  describe("env variable masking (getFunctionDetail / listFunctionTriggers)", () => {
    const detailWithSecret = {
      Status: "Active",
      Timeout: 20,
      Environment: {
        Variables: [
          { Key: "DB_PASSWORD", Value: "super-secret-value" },
          { Key: "NODE_ENV", Value: "production" },
        ],
      },
      VpcConfig: {},
    };

    it("masks env variable values by default and keeps Key + ValueLength", async () => {
      mockGetFunctionDetail.mockResolvedValue(detailWithSecret);

      const result = await tools.queryFunctions.handler({
        action: "getFunctionDetail",
        functionName: "hello",
      });

      const payload = JSON.parse(result.content[0].text);
      const variables = payload.data.functionDetail.Environment.Variables;
      expect(variables[0]).toMatchObject({
        Key: "DB_PASSWORD",
        Value: "***",
        ValueLength: "super-secret-value".length,
      });
      expect(variables[1]).toMatchObject({
        Key: "NODE_ENV",
        Value: "***",
        ValueLength: "production".length,
      });
      // raw 与 functionDetail 同步脱敏，明文不出现在任何返回字段
      expect(JSON.stringify(payload)).not.toContain("super-secret-value");
      // 日志侧也拿到脱敏后的结果
      const logged = mockLogCloudBaseResult.mock.calls.at(-1)?.[1];
      expect(logged.Environment.Variables[0].Value).toBe("***");
    });

    it("returns plaintext env values only when revealEnvValues=true, but still masks logs", async () => {
      mockGetFunctionDetail.mockResolvedValue(detailWithSecret);

      const result = await tools.queryFunctions.handler({
        action: "getFunctionDetail",
        functionName: "hello",
        revealEnvValues: true,
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload.data.functionDetail.Environment.Variables[0]).toMatchObject({
        Key: "DB_PASSWORD",
        Value: "super-secret-value",
      });
      const logged = mockLogCloudBaseResult.mock.calls.at(-1)?.[1];
      expect(logged.Environment.Variables[0].Value).toBe("***");
    });

    it("masks env variable values in listFunctionTriggers raw payload", async () => {
      mockGetFunctionDetail.mockResolvedValue(detailWithSecret);

      const result = await tools.queryFunctions.handler({
        action: "listFunctionTriggers",
        functionName: "hello",
      });

      const payload = JSON.parse(result.content[0].text);
      expect(JSON.stringify(payload)).not.toContain("super-secret-value");
      expect(payload.data.raw.Environment.Variables[0]).toMatchObject({
        Key: "DB_PASSWORD",
        Value: "***",
      });
    });

    it("documents the default-masking behavior in the queryFunctions schema", () => {
      const schema = tools.queryFunctions.meta.inputSchema;
      expect(schema.revealEnvValues).toBeDefined();
      expect(schema.revealEnvValues._def.description).toContain("默认 false");
    });
  });

  describe("getFunctionDeployStatus availability", () => {
    it("explains why the action cannot work in cloud mode", async () => {
      // 异步任务只由 buildStrategy=cloud/local 的真实部署创建，两者在 cloud mode 下都被拦；
      // image 策略走同步 createFunction(deployMode="image")，也不产生 taskId。
      // 因此这里必然查不到任务，要给出原因而不是通用的「任务不存在」。
      mockIsCloudMode.mockReturnValue(true);

      const result = await tools.queryFunctions.handler({
        action: "getFunctionDeployStatus",
        taskId: "any-task-id",
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload.success).toBe(false);
      expect(payload.errorCode).toBe("DEPLOY_TASK_NOT_FOUND");
      expect(payload.message).toContain("cloud mode");
      expect(payload.message).toContain("buildStrategy=cloud/local");
      // 明确拒绝，不该再去翻任务表
      expect(payload.data.cloudMode).toBe(true);
    });

    it("reports a missing task with the current envId in local mode", async () => {
      const result = await tools.queryFunctions.handler({
        action: "getFunctionDeployStatus",
        taskId: "missing-task-id",
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload.success).toBe(false);
      expect(payload.errorCode).toBe("DEPLOY_TASK_NOT_FOUND");
      expect(payload.message).toContain("env-test");
    });
  });

  /**
   * manageFunctions 对外的 imageConfig 入参 schema 与部署侧的 strict 联合共用同一份
   * 字段定义。这组用例守住这个不变量：两边任一侧单独演进都会在这里失败。
   */
  describe("imageConfig input schema contract", () => {
    const parseFunc = (imageConfig: Record<string, unknown>) =>
      tools.manageFunctions.meta.inputSchema.func.safeParse({
        name: "http-image-demo",
        type: "HTTP",
        buildStrategy: "image",
        imageConfig: {
          imageType: "personal",
          imageUri: "ccr.ccs.tencentyun.com/demo/http-image-demo:v1",
          ...imageConfig,
        },
      });

    it("keeps commandList and argsList instead of silently stripping them", () => {
      // 回归：扁平入参 schema 曾缺这两个字段，z.object 默认 strip 会把它们静默丢掉——
      // 用户传了完全不生效，也拿不到任何报错
      const parsed = parseFunc({
        commandList: ["python"],
        argsList: ["-u", "app.py"],
      });

      expect(parsed.success).toBe(true);
      expect(parsed.data?.imageConfig).toMatchObject({
        commandList: ["python"],
        argsList: ["-u", "app.py"],
      });
    });

    it("accepts the only imagePort the SDK allows", () => {
      expect(parseFunc({ imagePort: 9000 }).success).toBe(true);
    });

    it("rejects any imagePort other than 9000", () => {
      // SDK 契约注明「容器监听端口，仅允许 9000」。这里曾是任意 number，
      // 描述还写着「Job 型镜像填 -1」，照着填就会撞上部署侧 z.literal(9000) 的费解报错
      expect(parseFunc({ imagePort: -1 }).success).toBe(false);
      expect(parseFunc({ imagePort: 8080 }).success).toBe(false);
    });

    it("rejects an unknown field instead of dropping it", () => {
      expect(parseFunc({ imagePortt: 9000 }).success).toBe(false);
    });

    it("exposes the same field set as the deploy-side schema", () => {
      const toolFields = Object.keys(
        tools.manageFunctions.meta.inputSchema.func._def.innerType.shape
          .imageConfig._def.innerType.shape,
      ).sort();

      // 工具入参 = 公共字段 + 三个按 buildStrategy 分叉的字段
      expect(toolFields).toEqual(
        [
          ...Object.keys(FUNCTION_IMAGE_CONFIG_COMMON_FIELDS),
          "imageUri",
          "build",
          "localFallback",
        ].sort(),
      );
    });
  });
});
