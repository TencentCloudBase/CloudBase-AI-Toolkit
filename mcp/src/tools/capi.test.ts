import { describe, expect, it, vi } from "vitest";
import { buildCapiErrorMessage, registerCapiTools } from "./capi.js";
import type { ExtendedMcpServer } from "../server.js";

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerCapiTools(server);

  return { tools };
}

describe("buildCapiErrorMessage", () => {
  it("suggests likely tcb actions for invalid action names", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "CreatEnv",
      new Error("Action invalid or not found"),
    );

    expect(message).toContain("可能的 tcb Action");
    expect(message).toContain("`CreateEnv`");
  });

  it("shows param hints for known tcb actions", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "DestroyEnv",
      new Error("parameter `Foo` is not recognized"),
    );

    expect(message).toContain("常见参数键");
    expect(message).toContain("`EnvId`");
    expect(message).toContain("必填参数");
    expect(message).toContain("type DestroyEnvParams =");
    expect(message).toContain("/**");
  });

  it("adds CreateUser-specific required-key and field-name guidance", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "CreateUser",
      new Error("The request is missing the required parameter `EnvId`."),
    );

    expect(message).toContain("必填参数");
    expect(message).toContain("`EnvId`");
    expect(message).toContain("`Name`");
    expect(message).toContain("`Name`（而非 `UserName`）");
    expect(message).toContain("`UserStatus`（而非 `Status`）");
  });

  it("does not inject tcb action suggestions for non-tcb services", () => {
    const message = buildCapiErrorMessage(
      "scf",
      "CreatEnv",
      new Error("Action invalid or not found"),
    );

    expect(message).not.toContain("可能的 tcb Action");
  });
});

describe("registerCapiTools", () => {
  it("front-loads CreateUser guidance in the tool description", () => {
    const { tools } = createMockServer();
    const description = tools.callCloudApi.meta.description as string;

    expect(description).toContain("CreateUser 快速提醒");
    expect(description).toContain("`EnvId` 与 `Name`");
    expect(description).toContain("`Name` / `Type` / `UserStatus`");
    expect(description).toContain("`UserName` / `UserType` / `Status`");
  });
});
