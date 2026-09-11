import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockBuildHostingItem,
  mockNeutralizeHosting,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockBuildHostingItem: vi.fn(),
  mockNeutralizeHosting: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

vi.mock("./hosting-build-utils.js", () => ({
  HOSTING_BUILD_ERROR_CODES: {
    BUILD_OUTPUT_NOT_FOUND: "BUILD_OUTPUT_NOT_FOUND",
    DEPENDENCY_NOT_INSTALLED: "DEPENDENCY_NOT_INSTALLED",
    BUILD_FAILED: "BUILD_FAILED",
  },
  HostingBuildError: class HostingBuildError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "HostingBuildError";
      this.code = code;
    }
  },
  buildHostingItem: mockBuildHostingItem,
  neutralizeHostingForDeploy: mockNeutralizeHosting,
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
  it("registers deployBuild, deployPlan and deploy with expected annotations", async () => {
    const { tools } = await createDeployTools();

    expect(Object.keys(tools).sort()).toEqual(["deployApply", "deployBuild", "deployPlan"]);

    // deployBuild is a local-only build step: not read-only (executes the build command
    // and writes artifacts locally) but not destructive on cloud resources either.
    expect(tools.deployBuild.meta.annotations).toMatchObject({
      readOnlyHint: false,
      category: "deploy",
    });
    expect(tools.deployBuild.meta.annotations.destructiveHint).not.toBe(true);
    expect(tools.deployPlan.meta.annotations).toMatchObject({
      readOnlyHint: true,
      category: "deploy",
    });
    expect(tools.deployApply.meta.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      category: "deploy",
    });
  });

  it("deployBuild only exposes cwd/mode (no envId / confirm / destructive gates)", async () => {
    const { tools } = await createDeployTools();

    expect(Object.keys(tools.deployBuild.meta.inputSchema).sort()).toEqual(["cwd", "mode"]);
    // No confirm gate: deployBuild only builds locally, never mutates cloud resources.
    expect(tools.deployBuild.meta.description).not.toContain("confirm=true");
  });

  it("declares only/skip as enums matching orchestration order in both tools", async () => {
    const { tools } = await createDeployTools();
    const expected = ["database", "functions", "app", "hosting", "gateway"];

    for (const toolName of ["deployPlan", "deployApply"]) {
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

    expect(tools.deployApply.meta.description).toContain("confirm=true");
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
    const result = parseToolResult(await tools.deployApply.handler({ cwd: "/tmp/any" }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("confirm=true");
    expect(mockGetCloudBaseManager).not.toHaveBeenCalled();
  });

  it("rejects when confirm is false", async () => {
    const { tools } = await createDeployTools();
    const result = parseToolResult(await tools.deployApply.handler({ confirm: false, cwd: "/tmp/any" }));

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
      await tools.deployApply.handler({
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

    await tools.deployApply.handler({ confirm: true, cwd });

    expect(deployMock.mock.calls[0][0].yes).toBe(false);
  });

  it("rejects invalid concurrency values", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    for (const concurrency of [0, 1.5, -1]) {
      const result = parseToolResult(
        await tools.deployApply.handler({ confirm: true, cwd, concurrency }),
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

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(false);
    expect(result.message).toContain("gateway timeout");
    expect(result.errorCode).toBe("DEPLOY_FAILED");
  });

  it("propagates a code from the orchestrator error onto errorCode", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    const err = Object.assign(new Error("db migration conflict"), {
      code: "MIGRATION_CONFLICT",
    });
    deployMock.mockRejectedValue(err);

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("MIGRATION_CONFLICT");
  });
});

describe("error envelope carries a stable errorCode", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
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

  it("CONFIG_NOT_FOUND when no cloudbaserc under cwd", async () => {
    const { tools } = await createDeployTools();
    const emptyDir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-deploy-test-"));
    tmpDirs.push(emptyDir);

    const result = parseToolResult(await tools.deployPlan.handler({ cwd: emptyDir }));
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("CONFIG_NOT_FOUND");
  });

  it("CONFIG_INVALID when schema validation fails", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", envId: "env-1", functions: [{ timeout: 5 }] });

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("CONFIG_INVALID");
  });

  it("ENV_UNRESOLVED when env id cannot be determined", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", functions: [{ name: "fn-a" }] });
    mockGetEnvId.mockResolvedValue("");

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("ENV_UNRESOLVED");
  });

  it("CONFIRM_REQUIRED when deploy is called without confirm", async () => {
    const { tools } = await createDeployTools();
    const result = parseToolResult(await tools.deployApply.handler({ cwd: "/tmp/any" }));
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("CONFIRM_REQUIRED");
  });

  it("INVALID_CONCURRENCY on bad concurrency values", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    const result = parseToolResult(
      await tools.deployApply.handler({ confirm: true, cwd, concurrency: 0 }),
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_CONCURRENCY");
  });
});

describe("deployPlan reconciles action classification with execution (yes semantics)", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
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

  it("re-labels an existing function (update) as skip when yes is not passed", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    deployPlanMock.mockResolvedValue([
      { type: "functions", name: "fn-a", status: "update", action: "覆盖更新已存在函数 fn-a" },
    ]);

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));

    expect(result.success).toBe(true);
    expect(result.data.yes).toBe(false);
    const item = (result.data.plan as any[])[0];
    // Plan must reflect what deploy actually does: yes=false -> conservative skip.
    expect(item.status).toBe("skip");
    expect(item.declaredStatus).toBe("update");
  });

  it("keeps update when yes=true (deploy will actually overwrite)", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    deployPlanMock.mockResolvedValue([
      { type: "functions", name: "fn-a", status: "update", action: "覆盖更新已存在函数 fn-a" },
    ]);

    const result = parseToolResult(await tools.deployPlan.handler({ cwd, yes: true }));

    expect(result.data.yes).toBe(true);
    const item = (result.data.plan as any[])[0];
    expect(item.status).toBe("update");
    expect(item.declaredStatus).toBeUndefined();
  });

  it("does not touch create / non-function statuses regardless of yes", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    deployPlanMock.mockResolvedValue([
      { type: "functions", name: "fn-new", status: "create", action: "新建函数 fn-new" },
      { type: "app", name: "app-1", status: "update", action: "覆盖更新云应用 app-1" },
      { type: "hosting", name: "site", status: "deploy", action: "直传覆盖静态托管 site" },
    ]);

    const result = parseToolResult(await tools.deployPlan.handler({ cwd }));
    const plan = result.data.plan as any[];

    expect(plan[0].status).toBe("create");
    // app update is not affected by the functions-only reconcile (deploy actually updates it)
    expect(plan[1].status).toBe("update");
    expect(plan[2].status).toBe("deploy");
  });
});

describe("deploy destructive database migration gate", () => {
  let tmpDirs: string[];

  const DB_CONFIG = {
    version: "2.1",
    envId: "env-from-config",
    database: { type: "postgresql", migrations: "./cloudbase/migrations" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
    deployMock.mockResolvedValue({ plan: [], results: [] });
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

  // Writes a project with a database config and the given migration files.
  function makeDbProject(migrations: Record<string, string>): string {
    const dir = writeProject(DB_CONFIG);
    tmpDirs.push(dir);
    const migDir = path.join(dir, "cloudbase", "migrations");
    fs.mkdirSync(migDir, { recursive: true });
    for (const [file, sql] of Object.entries(migrations)) {
      fs.writeFileSync(path.join(migDir, file), sql);
    }
    return dir;
  }

  // The dry-run plan the gate inspects: one aggregated database create item whose
  // changes[].to lists the pending migration identifiers.
  function planWithPending(pending: string[]) {
    return [
      {
        type: "database",
        name: "postgresql",
        status: "create",
        action: `将执行 ${pending.length} 条数据库迁移`,
        changes: pending.map((m) => ({ field: "migration", to: m })),
      },
    ];
  }

  it("blocks when a pending migration contains destructive SQL and confirmDestructive is absent", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeDbProject({
      "20260101000000_drop_users.sql": "DROP TABLE users;",
    });
    deployPlanMock.mockResolvedValue(planWithPending(["20260101000000_drop_users"]));

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DESTRUCTIVE_CONFIRM_REQUIRED");
    expect(result.message).toContain("20260101000000_drop_users");
    // must NOT have executed the real deploy
    expect(deployMock).not.toHaveBeenCalled();
  });

  it("proceeds when confirmDestructive=true even with destructive migrations", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeDbProject({
      "20260101000000_drop_users.sql": "DROP TABLE users;",
    });
    deployPlanMock.mockResolvedValue(planWithPending(["20260101000000_drop_users"]));

    const result = parseToolResult(
      await tools.deployApply.handler({ confirm: true, confirmDestructive: true, cwd }),
    );

    expect(result.success).toBe(true);
    expect(deployMock).toHaveBeenCalledTimes(1);
    // gate short-circuits before executing when confirmDestructive is true: no dry-run needed
    expect(deployPlanMock).not.toHaveBeenCalled();
  });

  it("does not block additive-only migrations", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeDbProject({
      "20260101000000_create_users.sql": "CREATE TABLE users (id serial primary key);",
    });
    deployPlanMock.mockResolvedValue(planWithPending(["20260101000000_create_users"]));

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(true);
    expect(deployMock).toHaveBeenCalledTimes(1);
  });

  it("skips the gate entirely when database is excluded via skip", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeDbProject({
      "20260101000000_drop_users.sql": "DROP TABLE users;",
    });

    const result = parseToolResult(
      await tools.deployApply.handler({ confirm: true, cwd, skip: ["database"] }),
    );

    expect(result.success).toBe(true);
    // database not participating -> no dry-run, no gate
    expect(deployPlanMock).not.toHaveBeenCalled();
    expect(deployMock).toHaveBeenCalledTimes(1);
  });

  it("only counts pending migrations, not already-applied destructive files", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeDbProject({
      "20260101000000_drop_users.sql": "DROP TABLE users;",
      "20260102000000_add_col.sql": "ALTER TABLE t ADD COLUMN c int;",
    });
    // drop_users is already applied (not in pending) -> should not block
    deployPlanMock.mockResolvedValue(planWithPending(["20260102000000_add_col"]));

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(true);
    expect(deployMock).toHaveBeenCalledTimes(1);
  });
});

const HOSTING_CONFIG = {
  version: "2.1",
  envId: "env-from-config",
  hosting: [{ name: "site", root: ".", buildCommand: "npm run build", outputDir: "dist" }],
};

describe("deployBuild", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
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

  function makeProject(config: Record<string, unknown> = HOSTING_CONFIG): string {
    const dir = writeProject(config);
    tmpDirs.push(dir);
    return dir;
  }

  it("reports CONFIG_NOT_FOUND when no cloudbaserc exists under cwd", async () => {
    const { tools } = await createDeployTools();
    const emptyDir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-deploy-test-"));
    tmpDirs.push(emptyDir);

    const result = parseToolResult(await tools.deployBuild.handler({ cwd: emptyDir }));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("CONFIG_NOT_FOUND");
    expect(mockBuildHostingItem).not.toHaveBeenCalled();
  });

  it("says nothing to build when config has no hosting", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", envId: "env-from-config" });

    const result = parseToolResult(await tools.deployBuild.handler({ cwd }));

    expect(result.success).toBe(true);
    expect(result.message).toContain("无需构建");
    expect(mockBuildHostingItem).not.toHaveBeenCalled();
  });

  it("builds every hosting item and reports built/skipped counts", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({
      version: "2.1",
      envId: "env-from-config",
      hosting: [
        { name: "site-a", root: ".", buildCommand: "npm run build" },
        { name: "site-b", root: ".", framework: "static" },
      ],
    });
    mockBuildHostingItem
      .mockReturnValueOnce({
        name: "site-a",
        root: cwd,
        action: "built",
        buildCommand: "npm run build",
        outputDir: path.join(cwd, "dist"),
      })
      .mockReturnValueOnce({ name: "site-b", root: cwd, action: "skipped" });

    const result = parseToolResult(await tools.deployBuild.handler({ cwd }));

    expect(result.success).toBe(true);
    expect(result.data.built).toBe(1);
    expect(result.data.skipped).toBe(1);
    expect(result.data.items).toHaveLength(2);
    expect(result.message).toContain("deployApply");
    expect(mockBuildHostingItem).toHaveBeenCalledTimes(2);
  });

  it("never requires env resolution or a manager (pure local build step)", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    mockBuildHostingItem.mockReturnValue({
      name: "site",
      root: cwd,
      action: "built",
      outputDir: path.join(cwd, "dist"),
    });

    await tools.deployBuild.handler({ cwd });

    expect(mockGetCloudBaseManager).not.toHaveBeenCalled();
    expect(mockGetEnvId).not.toHaveBeenCalled();
  });

  it("surfaces strategy-layer errors with a stable errorCode", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    mockBuildHostingItem.mockImplementation(() => {
      throw Object.assign(new Error("[site] 未检测到 node_modules"), {
        code: "DEPENDENCY_NOT_INSTALLED",
      });
    });

    const result = parseToolResult(await tools.deployBuild.handler({ cwd }));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DEPENDENCY_NOT_INSTALLED");
  });
});

describe("deployApply hosting neutralization", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator();
    deployMock.mockResolvedValue({ plan: [], results: [] });
    // Default: neutralization succeeds and returns a config whose hosting was cleared.
    mockNeutralizeHosting.mockImplementation((config: Record<string, unknown>) => ({
      ...config,
      hosting: [],
    }));
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

  function makeProject(config: Record<string, unknown> = HOSTING_CONFIG): string {
    const dir = writeProject(config);
    tmpDirs.push(dir);
    return dir;
  }

  it("neutralizes hosting before deploying when hosting participates", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(true);
    expect(result.data.hostingNeutralized).toBe(true);
    expect(mockNeutralizeHosting).toHaveBeenCalledTimes(1);
    expect(mockNeutralizeHosting).toHaveBeenCalledWith(expect.anything(), cwd);
    // The orchestrator receives the neutralized config (hosting commands cleared),
    // not the raw config — so deploy skips the implicit local build.
    expect(deployMock.mock.calls[0][0].config.hosting).toEqual([]);
  });

  it("blocks deploy with BUILD_OUTPUT_NOT_FOUND when a participating item lacks build output", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();
    mockNeutralizeHosting.mockImplementation(() => {
      throw Object.assign(
        new Error(
          "[site] 未找到构建产物：/x/dist\nhosting 声明式部署不再自动执行本地构建，请先执行 deployBuild 完成构建后再执行 deployApply。",
        ),
        { code: "BUILD_OUTPUT_NOT_FOUND" },
      );
    });

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("BUILD_OUTPUT_NOT_FOUND");
    expect(result.message).toContain("deployBuild");
    expect(deployMock).not.toHaveBeenCalled();
  });

  it("skips neutralization when hosting is excluded via skip/only", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject();

    await tools.deployApply.handler({ confirm: true, cwd, skip: ["hosting"] });
    await tools.deployApply.handler({ confirm: true, cwd, only: ["functions"] });

    expect(mockNeutralizeHosting).not.toHaveBeenCalled();
    expect(deployMock).toHaveBeenCalledTimes(2);
  });

  it("skips neutralization when the config has no hosting resources", async () => {
    const { tools } = await createDeployTools();
    const cwd = makeProject({ version: "2.1", envId: "env-from-config" });

    const result = parseToolResult(await tools.deployApply.handler({ confirm: true, cwd }));

    expect(result.success).toBe(true);
    expect(result.data.hostingNeutralized).toBe(false);
    expect(mockNeutralizeHosting).not.toHaveBeenCalled();
    expect(deployMock).toHaveBeenCalledTimes(1);
  });
});
