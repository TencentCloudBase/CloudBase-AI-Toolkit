import { describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerDataModelTools } from "./dataModel.js";

const { mockGetCloudBaseManager, mockGetEnvId, mockLogCloudBaseResult } =
  vi.hoisted(() => ({
    mockGetCloudBaseManager: vi.fn(),
    mockGetEnvId: vi.fn(),
    mockLogCloudBaseResult: vi.fn(),
  }));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name, meta, handler) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerDataModelTools(server);

  return { tools };
}

describe("data model tools", () => {
  it("modifyDataModel schema should expose dbInstanceType as supported enum values", () => {
    const { tools } = createMockServer();
    const dbInstanceTypeSchema = tools.modifyDataModel.meta.inputSchema.dbInstanceType;

    expect(dbInstanceTypeSchema.safeParse("MYSQL").success).toBe(true);
    expect(dbInstanceTypeSchema.safeParse("FLEXDB").success).toBe(true);
    expect(dbInstanceTypeSchema.safeParse("postgres").success).toBe(false);
    expect(dbInstanceTypeSchema._def.innerType._def.innerType.options).toEqual([
      "MYSQL",
      "FLEXDB",
    ]);
  });

  it("create polls QueryModelTaskStatus until terminal status instead of failing on intermediate states", async () => {
    const { tools } = createMockServer();

    const lowcodeCall = vi.fn(async ({ Action }: { Action: string }) => {
      if (Action === "BatchCreateDataModelList") {
        return { RequestId: "req-1", Data: { TaskId: "task-1" } };
      }
      // QueryModelTaskStatus: first two polls report an intermediate "running" state,
      // then the task reaches the terminal "success" state.
      if (lowcodeCall.mock.calls.filter(([a]) => (a as any).Action === "QueryModelTaskStatus").length <= 2) {
        return { RequestId: "req-poll", Data: { Status: "running" } };
      }
      return {
        RequestId: "req-poll",
        Data: { Status: "success", SuccessResourceIdList: ["todo"] },
      };
    });

    mockGetCloudBaseManager.mockResolvedValue({
      commonService: () => ({ call: lowcodeCall }),
    });
    mockGetEnvId.mockResolvedValue("env-test");

    const payload = JSON.parse(
      (
        await tools.modifyDataModel.handler({
          mermaidDiagram: "classDiagram\n    class Todo {\n        title: string <<Title>>\n    }",
          action: "create",
        })
      ).content[0].text,
    );

    expect(payload.success).toBe(true);
    expect(payload.status).toBe("success");
    expect(payload.successModels).toEqual(["todo"]);
    expect(payload.models).toEqual(["Todo"]);
    // failedModels derives from model names not present in SuccessResourceIdList.
    expect(payload.failedModels).toEqual(["Todo"]);
    // Polling must continue past the intermediate "running" states.
    expect(
      lowcodeCall.mock.calls.filter(([a]) => (a as any).Action === "QueryModelTaskStatus").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("create reports failure only on terminal fail status", async () => {
    const { tools } = createMockServer();

    const lowcodeCall = vi.fn(async ({ Action }: { Action: string }) => {
      if (Action === "BatchCreateDataModelList") {
        return { RequestId: "req-1", Data: { TaskId: "task-1" } };
      }
      return { RequestId: "req-poll", Data: { Status: "fail" } };
    });

    mockGetCloudBaseManager.mockResolvedValue({
      commonService: () => ({ call: lowcodeCall }),
    });
    mockGetEnvId.mockResolvedValue("env-test");

    const payload = JSON.parse(
      (
        await tools.modifyDataModel.handler({
          mermaidDiagram: "classDiagram\n    class Todo {\n        title: string <<Title>>\n    }",
          action: "create",
        })
      ).content[0].text,
    );

    expect(payload.success).toBe(false);
    expect(payload.status).toBe("fail");
    expect(payload.message).toContain("fail");
  });
  it("modifyDataModel reports the stage and context when the SDK call throws", async () => {
    // 灯塔 168h：modifyDataModel 的 24 次失败只看到「Expected object, got undefined」，
    // 看不出是环境没绑、dbInstanceType 没传，还是模型结构不合法。这条锁住阶段与上下文。
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetCloudBaseManager.mockResolvedValue({
      commonService: () => ({
        call: vi.fn().mockRejectedValue(new Error("Expected object, got undefined")),
      }),
    });

    try {
      const { tools } = createMockServer();
      const result = await tools.modifyDataModel.handler({
        mermaidDiagram: "classDiagram\n  class demo {\n    id: string <<主键>>\n  }\n",
        action: "create",
        dbInstanceType: "FLEXDB",
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload.stage).toBe("BatchCreateDataModelList");
      expect(payload.error).toContain("Expected object");
      expect(payload.context).toMatchObject({
        envId: "env-test",
        dbInstanceType: "FLEXDB",
        modelCount: 1,
      });
    } finally {
      mockGetCloudBaseManager.mockReset();
      mockGetEnvId.mockReset();
    }
  });
});
