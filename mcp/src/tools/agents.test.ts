import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentTools } from "./agents.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockDescribeAgentList,
  mockDescribeAgent,
  mockGetAgentLogs,
  mockCreateAgent,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockDescribeAgentList: vi.fn(),
  mockDescribeAgent: vi.fn(),
  mockGetAgentLogs: vi.fn(),
  mockCreateAgent: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
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

  registerAgentTools(server);

  return { tools };
}

describe("agent tools", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDescribeAgentList.mockResolvedValue({
      Agents: [{ AgentId: "agent-1", Name: "demo-agent" }],
      Total: 1,
      RequestId: "req-agent-list",
    });
    mockDescribeAgent.mockResolvedValue({
      AgentId: "agent-1",
      Name: "demo-agent",
      RequestId: "req-agent-detail",
    });
    mockGetAgentLogs.mockResolvedValue({
      LogResults: { Results: [{ Message: "hello" }] },
      RequestId: "req-agent-logs",
    });
    mockCreateAgent.mockResolvedValue({
      AgentId: "agent-2",
      RequestId: "req-agent-create",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      agent: {
        describeAgentList: mockDescribeAgentList,
        describeAgent: mockDescribeAgent,
        getAgentLogs: mockGetAgentLogs,
        createAgent: mockCreateAgent,
      },
    });
    ({ tools } = createMockServer());
  });

  it("queryAgents(action=listAgents) should list agents", async () => {
    const result = await tools.queryAgents.handler({ action: "listAgents" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeAgentList).toHaveBeenCalledWith({
      PageNumber: 1,
      PageSize: 20,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "listAgents",
        agents: [expect.objectContaining({ AgentId: "agent-1" })],
      },
    });
  });

  it("manageAgents(action=createAgent) should create agent", async () => {
    const result = await tools.manageAgents.handler({
      action: "createAgent",
      params: {
        name: "demo-agent",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAgent).toHaveBeenCalledWith({
      Name: "demo-agent",
      Runtime: "Nodejs20.19",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createAgent",
      },
    });
  });

  it("manageAgents(action=createAgent) should support top-level fields", async () => {
    const result = await tools.manageAgents.handler({
      action: "createAgent",
      name: "demo-agent-top-level",
      description: "test agent",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAgent).toHaveBeenCalledWith({
      Name: "demo-agent-top-level",
      Description: "test agent",
      Runtime: "Nodejs20.19",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createAgent",
      },
    });
  });

  it("manageAgents(action=createAgent) should sanitize name with underscores", async () => {
    const result = await tools.manageAgents.handler({
      action: "createAgent",
      params: {
        name: "test_agent",
      },
    });
    const payload = JSON.parse(result.content[0].text);

    // 下划线应被替换为连字符
    expect(mockCreateAgent).toHaveBeenCalledWith({
      Name: "test-agent",
      Runtime: "Nodejs20.19",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createAgent",
      },
    });
  });

  it("manageAgents(action=createAgent) should fail when name is missing", async () => {
    const result = await tools.manageAgents.handler({
      action: "createAgent",
      description: "missing name",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      message: expect.stringContaining("必须提供 name"),
    });
  });
});
