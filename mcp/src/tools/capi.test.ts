import { describe, expect, it } from "vitest";
import { buildCapiErrorMessage } from "./capi.js";

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

  it("does not inject tcb action suggestions for non-tcb services", () => {
    const message = buildCapiErrorMessage(
      "scf",
      "CreatEnv",
      new Error("Action invalid or not found"),
    );

    expect(message).not.toContain("可能的 tcb Action");
  });

  it("provides helpful guidance for 400 invalid parameter value errors", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "CreateEnv",
      new Error("400 invalid parameter value (abc123/def456)"),
    );

    expect(message).toContain("参数值无效或不符合 API 要求");
    expect(message).toContain("逐个检查传入的参数值");
    expect(message).toContain("参数值类型是否正确");
    expect(message).toContain("searchKnowledgeBase");
  });

  it("shows param hints for 400 errors on known tcb actions", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "DestroyEnv",
      new Error("400 invalid parameter value"),
    );

    expect(message).toContain("参数值无效或不符合 API 要求");
    expect(message).toContain("`EnvId`");
  });

  it("provides guidance for 400 errors on non-tcb services", () => {
    const message = buildCapiErrorMessage(
      "scf",
      "CreateFunction",
      new Error("400 invalid parameter value"),
    );

    expect(message).toContain("参数值无效或不符合 API 要求");
    expect(message).toContain("逐个检查传入的参数值");
  });
});
