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

  it("adds destroy env specific guidance for invalid parameter values", () => {
    const message = buildCapiErrorMessage(
      "tcb",
      "DestroyEnv",
      new Error("400 invalid parameter value"),
    );

    expect(message).toContain("canonical full `EnvId`");
    expect(message).toContain("aliasExact=true");
    expect(message).toContain("{ \"EnvId\": \"env-xxx\" }");
    expect(message).toContain("`IsForce: true`");
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
