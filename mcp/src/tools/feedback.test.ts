import { describe, expect, it, vi } from "vitest";
import {
  buildFeedbackTemplateUrl,
  FEEDBACK_ISSUE_NEW_URL,
  FEEDBACK_TOOL_NAME,
  registerFeedbackTools,
} from "./feedback.js";

const ENV_ID = "env-should-not-appear-9f3c";
const SECRET_ID = "AKIDshouldnotappear999";

function makeServer(site: "domestic" | "intl" = "domestic") {
  return {
    cloudBaseOptions: {
      site,
      envId: ENV_ID,
      secretId: SECRET_ID,
      secretKey: "secret-key-should-not-appear",
    },
  };
}

async function callFeedback(site: "domestic" | "intl", channel: "case" | "retrospective") {
  const registerTool = vi.fn();
  const server = { ...makeServer(site), registerTool };
  registerFeedbackTools(server as any);
  const handler = registerTool.mock.calls[0][2] as (args: { channel: string }) => Promise<{
    content: Array<{ text: string }>;
  }>;
  const result = await handler({ channel });
  return JSON.parse(result.content[0].text) as {
    success: boolean;
    channel: string;
    url: string;
    nextStep: string;
  };
}

describe("prepareFeedback URL template", () => {
  it("registers a single channel argument", () => {
    const registerTool = vi.fn();
    registerFeedbackTools({ registerTool } as any);
    expect(FEEDBACK_TOOL_NAME).toBe("prepareFeedback");
    const config = registerTool.mock.calls[0][1] as { inputSchema: Record<string, unknown> };
    expect(registerTool).toHaveBeenCalledWith(
      "prepareFeedback",
      expect.objectContaining({ title: "feedback.title" }),
      expect.any(Function),
    );
    expect(Object.keys(config.inputSchema)).toEqual(["channel"]);
  });

  it("returns the domestic case template without a body", async () => {
    const payload = await callFeedback("domestic", "case");
    const url = new URL(payload.url);
    expect(payload.success).toBe(true);
    expect(url.origin + url.pathname).toBe(FEEDBACK_ISSUE_NEW_URL.domestic);
    expect(url.searchParams.get("template")).toBe("1-case-showcase.yml");
    expect(url.searchParams.get("title")).toBe("[案例]");
    expect(url.searchParams.has("session")).toBe(false);
    expect(url.searchParams.has("body")).toBe(false);
    expect(payload.url).not.toContain(ENV_ID);
    expect(payload.url).not.toContain(SECRET_ID);
    expect(payload.nextStep).toContain("不要代为提交");
  });

  it("returns the domestic retrospective template", async () => {
    const payload = await callFeedback("domestic", "retrospective");
    const url = new URL(payload.url);
    expect(url.searchParams.get("template")).toBe("2-dev-retrospective.yml");
    expect(url.searchParams.get("title")).toBe("[复盘]");
    expect(url.searchParams.has("session")).toBe(false);
  });

  it("returns the GitHub new-issue page for the international site", async () => {
    const payload = await callFeedback("intl", "case");
    const url = new URL(payload.url);
    expect(url.origin + url.pathname).toBe(FEEDBACK_ISSUE_NEW_URL.intl);
    expect(url.searchParams.get("title")).toBe("[case]");
    expect(url.searchParams.has("body")).toBe(false);
    expect(url.searchParams.has("template")).toBe(false);
    expect(payload.nextStep).toContain("不要代为提交");
  });

  it("builds template URLs without embedding a draft", () => {
    const domestic = buildFeedbackTemplateUrl("domestic", "retrospective");
    const intl = buildFeedbackTemplateUrl("intl", "retrospective");
    expect(domestic).not.toContain("session=");
    expect(intl).not.toContain("body=");
    expect(new URL(intl).searchParams.get("title")).toBe("[retrospective]");
  });
});
