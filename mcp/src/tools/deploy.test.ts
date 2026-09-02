import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

type RegisteredTool = { meta: any; handler: (args: any) => Promise<any> };

async function createDeployTools() {
  const tools: Record<string, RegisteredTool> = {};
  const server: any = {
    cloudBaseOptions: {},
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  };
  const { registerDeployTools } = await import("./deploy.js");
  registerDeployTools(server);
  return { tools, server };
}

function parseToolResult(res: any) {
  return JSON.parse(res.content[0].text);
}

function writeProject(config: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-deploy-test-"));
  fs.writeFileSync(
    path.join(dir, "cloudbaserc.json"),
    JSON.stringify(config, null, 2),
  );
  return dir;
}

const deployPlanMock = vi.fn();
const deployMock = vi.fn();

function mockOrchestrator() {
  mockGetCloudBaseManager.mockResolvedValue({
    getDeployOrchestrator: () => ({
      deployPlan: deployPlanMock,
      deploy: deployMock,
    }),
  });
}

const BASE_CONFIG = {
  version: "2.1",
  envId: "env-from-config",
  functionDefaultConfig: { timeout: 10 },
  functions: [
    { name: "fn-a", timeout: 5 },
    { name: "fn-b" },
  ],
};

describe("deploy tools registration", () => {
  it("registers deployPlan and deploy with expected annotations", async () => {
    const { tools } = await createDeployTools();

    expect(Object.keys(tools).sort()).toEqual(["deploy", "deployPlan"]);

    expect(tools.deployPlan.meta.annotations).toMatchObject({
      readOnlyHint: true,
      category: "deploy",
    });
    expect(tools.deploy.meta.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      category: "deploy",
    });
  });

  it("declares only/skip as enums matching orchestration order in both tools", async () => {
    const { tools } = await createDeployTools();
    const expected = ["database", "functions", "app", "hosting", "gateway"];

    for (const toolName of ["deployPlan", "deploy"]) {
      for (const field of ["only", "skip"]) {
        const schema = tools[toolName].meta.inputSchema[field];
        expect(
          schema.safeParse(expected).success,
          `${toolName}.${field} should accept all resource types`,
        ).toBe(true);
        expect(
          schema.safeParse(["not-a-resource"]).success,
          `${toolName}.${field} should reject values outside the enum`,
        ).toBe(false);
      }
    }
  });

  it("marks deploy as requiring explicit confirm in its description", async () => {
    const { tools } = await createDeployTools();

    expect(tools.deploy.meta.description).toContain("confirm=true");
    expect(tools.deployPlan.meta.description).toContain("dry-run");
  });
});

describe("deploy confirm gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
  });

  it("rejects when confirm is not passed", async () => {
    const { tools } = await createDeployTools();
    const result = parseToolResult(await tools.deploy.handler({ cwd: "/tmp/any" }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("confirm=true");
    expect(mockGetCloudBaseManager).not.toHaveBeenCalled();
  });

  it("rejects when confirm is false", async () => {
    const { tools } = await createDeployTools();
    const result = parseToolResult(await tools.deploy.handler({ confirm: false, cwd: "/tmp/any" }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("confirm=true");
    expect(deployMock).not.toHaveBeenCalled();
  });
});

describe("deployPlan", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
    deployPlanMock.mockResolvedValue([
      { type: "functions", name: "fn-a", status: "create", action: "新建" },
    ]);
    tmpDirs = [];
  });

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures in restricted CI/sandbox delete hooks.
      }
    }
  });

  function makeProject(config: Record<string, unknown> = BASE_CONFIG): string {
    const dir = writeProject(config);
    tmpDirs.push(dir);
    return dir;
  }

  it("reports a clear error when no cloudbaserc exists under cwd", async () => {
    const { tools } = await createDeployTools();
    const emptyDir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-deploy-test-"));
    tmpDirs.push(emptyDir);

    const result = parseToolResult(await tools.deployPlan.handler({ cwd: emptyDir }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("未在");
    expect(result.message).toContain("cloudbaserc");
    expect(mockGetCloudBaseManager).not.toHaveBeenCalled();
  });

  it("resolves config, applies functionDefaultConfig and passes the plan through", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));

    expect(result.success).toBe(true);
    expect(result.message).toBe("已生成声明式部署计划");
    expect(result.data.plan).toEqual([
      { type: "functions", name: "fn-a", status: "create", action: "新建" },
    ]);
    expect(result.data.envId).toBe("env-from-config");
    expect(result.data.mode).toBeNull();

    const call = deployPlanMock.mock.calls[0][0];
    expect(call.dryRun).toBe(true);
    expect(call.envId).toBe("env-from-config");
    expect(call.cwd).toBe(cwd);
    expect(call.config.envId).toBe("env-from-config");
    expect(call.config.functions).toEqual([
      { name: "fn-a", timeout: 5 },
      { name: "fn-b", timeout: 10 },
    ]);
  });

  it("passes declarative image functions through without flattening", async () => {
    const { tools } = await createDeployTools();
    const declarativeImageFunction = {
      name: "fn-image",
      type: "HTTP",
      buildStrategy: "local",
      imageConfig: {
        imageType: "enterprise",
        registryId: "reg-1",
        build: { dockerfile: "Dockerfile", repository: "ns/app" },
      },
    };
    const cwd = makeProject({
      version: "2.1",
      envId: "env-from-config",
      functions: [declarativeImageFunction],
    });

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));

    // schema 按声明式嵌套形状校验（additionalProperties: false + imageConfig 约束），
    // 字段摊平由 SDK 侧 normalizeFunctionConfigs 完成，MCP 不做映射。
    expect(result.success).toBe(true);
    const fn = deployPlanMock.mock.calls[0][0].config.functions[0];
    expect(fn).toEqual({
      name: "fn-image",
      type: "HTTP",
      buildStrategy: "local",
      imageConfig: {
        imageType: "enterprise",
        registryId: "reg-1",
        build: { dockerfile: "Dockerfile", repository: "ns/app" },
      },
    });
  });

  it("merges envOverrides when mode matches and strips the overrides key", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({
      ...BASE_CONFIG,
      envId: "env-base",
      envOverrides: { staging: { envId: "env-staging" } },
    });

    const staged = parseToolResult(await tools.deployPlan.handler({ cwd, mode: "staging" }));
    expect(staged.success).toBe(true);
    expect(staged.data.envId).toBe("env-staging");
    expect(staged.data.mode).toBe("staging");
    expect(deployPlanMock.mock.calls[0][0].config.envId).toBe("env-staging");
    expect(deployPlanMock.mock.calls[0][0].config.envOverrides).toBeUndefined();

    const untouched = parseToolResult(await tools.deployPlan.handler({ cwd }));
    expect(untouched.data.envId).toBe("env-base");
  });

  it("gives explicit envId input the highest priority", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    const result = parseToolResult(
      await tools.deployPlan.handler({ cwd, envId: "env-explicit" }),
    );

    expect(result.data.envId).toBe("env-explicit");
    expect(deployPlanMock.mock.calls[0][0].envId).toBe("env-explicit");
  });

  it("falls back to session envId when config has none", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", functions: [{ name: "fn-a" }] });
    mockGetEnvId.mockResolvedValue("env-session");

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));

    expect(result.data.envId).toBe("env-session");
  });

  it("fails with actionable message when envId cannot be resolved at all", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", functions: [{ name: "fn-a" }] });
    mockGetEnvId.mockResolvedValue("");

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("未能确定部署环境 ID");
  });

  it("reports schema validation failures with field details", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", envId: "env-1", functions: [{ timeout: 5 }] });

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("cloudbaserc 配置校验未通过");
    expect(deployPlanMock).not.toHaveBeenCalled();
  });
});

describe("deploy execution", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
    deployMock.mockResolvedValue({
      plan: [],
      results: [{ type: "functions", name: "fn-a", ok: true }],
    });
    tmpDirs = [];
  });

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures in restricted CI/sandbox delete hooks.
      }
    }
  });

  function makeProject(config: Record<string, unknown> = BASE_CONFIG): string {
    const dir = writeProject(config);
    tmpDirs.push(dir);
    return dir;
  }

  it("executes the orchestrator with resolved options when confirm=true", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    const result = parseToolResult(
      await tools.deploy.handler({
        confirm: true,
        cwd,
        yes: true,
        concurrency: 3,
        continueOnError: true,
        only: ["functions"],
        skip: ["database"],
      }),
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("声明式部署已执行");
    expect(result.data.result).toEqual({
      plan: [],
      results: [{ type: "functions", name: "fn-a", ok: true }],
    });

    const call = deployMock.mock.calls[0][0];
    expect(call).toMatchObject({
      envId: "env-from-config",
      cwd,
      yes: true,
      concurrency: 3,
      continueOnError: true,
      only: ["functions"],
      skip: ["database"],
    });
    expect(call.dryRun).toBeUndefined();
  });

  it("defaults yes to false (conservative skip) when not provided", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    await tools.deploy.handler({ confirm: true, cwd });

    expect(deployMock.mock.calls[0][0].yes).toBe(false);
  });

  it("rejects invalid concurrency values", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    for (const concurrency of [0, 1.5, -1]) {
      const result = parseToolResult(
        await tools.deploy.handler({ confirm: true, cwd, concurrency }),
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("并发数");
    }
    expect(deployMock).not.toHaveBeenCalled();
  });

  it("returns the error envelope when the orchestrator fails", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    deployMock.mockRejectedValue(new Error("gateway timeout"));

    const result = parseToolResult(await tools.deploy.handler({ confirm: true, cwd }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("gateway timeout");
  });
});
