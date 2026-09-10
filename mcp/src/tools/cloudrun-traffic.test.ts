import { describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

type RegisteredTool = { meta: any; handler: (args: any) => Promise<any> };

async function createCloudRunTools() {
  const tools: Record<string, RegisteredTool> = {};
  const server: any = {
    cloudBaseOptions: {},
    ide: "CodeBuddy",
    server: {
      sendLoggingMessage: vi.fn(),
    },
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  };
  const { registerCloudRunTools } = await import("./cloudrun.js");
  registerCloudRunTools(server);
  return { tools, server };
}

function parseToolResult(res: any) {
  const text = res.content[0].text;
  return JSON.parse(text);
}

type ManagerMock = {
  commonService: ReturnType<typeof vi.fn>;
  cloudrun: {
    setTraffic: ReturnType<typeof vi.fn>;
    promote: ReturnType<typeof vi.fn>;
    rollback: ReturnType<typeof vi.fn>;
    getDeployRecords: ReturnType<typeof vi.fn>;
    getBuildLog?: ReturnType<typeof vi.fn>;
    detail?: ReturnType<typeof vi.fn>;
  };
};

function makeManager(options: {
  deployStatus?: string;
} = {}): ManagerMock {
  const { deployStatus = "normal" } = options;
  return {
    commonService: vi.fn().mockReturnValue({ call: vi.fn() }),
    cloudrun: {
      setTraffic: vi.fn().mockResolvedValue({ Success: true }),
      promote: vi.fn().mockResolvedValue({ Success: true }),
      rollback: vi.fn().mockResolvedValue({ Success: true }),
      detail: vi.fn().mockResolvedValue({
        BaseInfo: { ServerName: "my-svc", Status: "normal" },
      }),
      getDeployRecords: vi.fn().mockResolvedValue({
        DeployRecords: [
          {
            DeployId: "d1",
            DeployTime: "2026-08-14 10:00:00",
            Status: deployStatus,
            RunId: "run-2",
            BuildId: 200,
            FlowRatio: 100,
            ImageUrl: "",
            ScaleStatus: "normal",
            HasTraffic: true,
            TrafficType: "FULL",
            IsReleasing: false,
          },
          {
            DeployId: "d0",
            DeployTime: "2026-08-13 10:00:00",
            Status: "normal",
            RunId: "run-1",
            BuildId: 100,
            FlowRatio: 100,
            ImageUrl: "",
            ScaleStatus: "normal",
            HasTraffic: true,
            TrafficType: "FULL",
            IsReleasing: false,
          },
        ],
      }),
    },
  };
}

describe("manageCloudRun traffic schema", () => {
  it("exposes traffic in the action enum (z.enum)", async () => {
    const { tools } = await createCloudRunTools();
    const actionEnum = tools.manageCloudRun.meta.inputSchema.action;
    expect(actionEnum._def.values).toContain("traffic");
  });

  it("exposes trafficOp as z.enum with set/promote/rollback", async () => {
    const { tools } = await createCloudRunTools();
    const trafficOp = tools.manageCloudRun.meta.inputSchema.trafficOp.unwrap();
    expect(trafficOp._def.typeName).toBe("ZodEnum");
    expect(trafficOp._def.values).toEqual(["set", "promote", "rollback"]);
  });
});

describe("manageCloudRun traffic handler", () => {
  it("calls setTraffic with stable/canary percent for trafficOp=set", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.manageCloudRun.handler({
      action: "traffic",
      serverName: "my-svc",
      trafficOp: "set",
      stablePercent: 90,
      canaryPercent: 10,
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.trafficOp).toBe("set");
    expect(parsed.data.stablePercent).toBe(90);
    expect(parsed.data.canaryPercent).toBe(10);

    expect(manager.cloudrun.setTraffic).toHaveBeenCalledTimes(1);
    expect(manager.cloudrun.setTraffic).toHaveBeenCalledWith("my-svc", 90, 10);
    expect(manager.cloudrun.promote).not.toHaveBeenCalled();
    expect(manager.cloudrun.rollback).not.toHaveBeenCalled();
  });

  it("calls promote for trafficOp=promote", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.manageCloudRun.handler({
      action: "traffic",
      serverName: "my-svc",
      trafficOp: "promote",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.trafficOp).toBe("promote");
    expect(parsed.data.serverName).toBe("my-svc");
    expect(manager.cloudrun.promote).toHaveBeenCalledTimes(1);
    expect(manager.cloudrun.promote).toHaveBeenCalledWith("my-svc");
  });

  it("calls rollback for trafficOp=rollback", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.manageCloudRun.handler({
      action: "traffic",
      serverName: "my-svc",
      trafficOp: "rollback",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.trafficOp).toBe("rollback");
    expect(manager.cloudrun.rollback).toHaveBeenCalledTimes(1);
    expect(manager.cloudrun.rollback).toHaveBeenCalledWith("my-svc");
  });

  it("rejects traffic action without trafficOp", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    await expect(
      tools.manageCloudRun.handler({ action: "traffic", serverName: "my-svc" }),
    ).rejects.toThrow(/trafficOp/);
  });

  it("rejects trafficOp=set without stablePercent/canaryPercent", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    await expect(
      tools.manageCloudRun.handler({
        action: "traffic",
        serverName: "my-svc",
        trafficOp: "set",
      }),
    ).rejects.toThrow(t("cloudrun.error.percentsRequired"));
    expect(manager.cloudrun.setTraffic).not.toHaveBeenCalled();
  });

  it("rejects trafficOp=set when stable+canary does not equal 100", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    await expect(
      tools.manageCloudRun.handler({
        action: "traffic",
        serverName: "my-svc",
        trafficOp: "set",
        stablePercent: 50,
        canaryPercent: 30,
      }),
    ).rejects.toThrow(
      t("cloudrun.error.percentSum", { stable: 50, canary: 30, sum: 80 }),
    );
    expect(manager.cloudrun.setTraffic).not.toHaveBeenCalled();
  });

  it("wraps SDK errors with actionable guidance", async () => {
    const manager = makeManager();
    manager.cloudrun.setTraffic.mockRejectedValue(
      new Error("不存在灰度中的版本或灰度版本部署未完成"),
    );
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    await expect(
      tools.manageCloudRun.handler({
        action: "traffic",
        serverName: "my-svc",
        trafficOp: "set",
        stablePercent: 90,
        canaryPercent: 10,
      }),
    ).rejects.toThrow(/manageCloudRun\/traffic\/set/);
  });
});

describe("queryCloudRun getDeployRecords", () => {
  it("exposes getDeployRecords in the action enum (z.enum)", async () => {
    const { tools } = await createCloudRunTools();
    const actionEnum = tools.queryCloudRun.meta.inputSchema.action;
    expect(actionEnum._def.values).toContain("getDeployRecords");
  });

  it("returns deploy records with BuildId/RunId/version fields", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getDeployRecords",
      detailServerName: "my-svc",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.serverName).toBe("my-svc");
    expect(parsed.data.total).toBe(2);
    expect(parsed.data.deployRecords[0].BuildId).toBe(200);
    expect(parsed.data.deployRecords[0].RunId).toBe("run-2");
    expect(parsed.data.latestDeploy.BuildId).toBe(200);
    expect(manager.cloudrun.getDeployRecords).toHaveBeenCalledWith({
      serverName: "my-svc",
    });
  });

  it("returns empty records gracefully when no deploy history exists", async () => {
    const manager = makeManager();
    manager.cloudrun.getDeployRecords.mockResolvedValue({ DeployRecords: [] });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getDeployRecords",
      detailServerName: "my-svc",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data.total).toBe(0);
    expect(parsed.data.latestDeploy).toBeNull();
  });

  it("requires a service name for getDeployRecords", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({ action: "getDeployRecords" });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("detailServerName 或 serverName");
    expect(manager.cloudrun.getDeployRecords).not.toHaveBeenCalled();
  });
});

describe("queryCloudRun detail deploy status case normalization", () => {
  it("treats uppercase FAILED as deploy failed", async () => {
    const manager = makeManager({ deployStatus: "FAILED" });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "detail",
      detailServerName: "my-svc",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toMatch(/部署失败/);
  });

  it("treats uppercase CREATING as deploy still running", async () => {
    const manager = makeManager({ deployStatus: "CREATING" });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "detail",
      detailServerName: "my-svc",
    });
    const parsed = parseToolResult(res);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toMatch(/仍在进行中/);
  });
});
