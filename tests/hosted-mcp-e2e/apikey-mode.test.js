/**
 * Mode A — static credentials (API key JWT and/or SecretId/SecretKey headers).
 * Skips when MCP_E2E credentials are absent (exit 0).
 */

import { describe, expect, test } from "vitest";
import {
  authHeadersForApikey,
  getEnvId,
  shouldRunApikeyMode,
} from "./helpers/env.mjs";
import { callTool, closeMcp, connectHostedMcpClient } from "./helpers/mcp-client.mjs";

const run = shouldRunApikeyMode();

describe.skipIf(!run)("Mode A — static credentials (apikey)", () => {
  test("initialize + tools/list + queryEnv(list)", async () => {
    const session = await connectHostedMcpClient({
      headers: authHeadersForApikey(),
      clientName: "hosted-mcp-e2e-apikey",
    });
    try {
      const tools = await session.client.listTools();
      expect(Array.isArray(tools?.tools)).toBe(true);
      expect(tools.tools.length).toBeGreaterThan(0);
      console.log(
        "[A] tools=",
        tools.tools.map((t) => t.name).slice(0, 12).join(","),
      );

      const envList = await callTool(session.client, "queryEnv", { action: "list" });
      const list = envList?.EnvList || envList?.envList || [];
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      const envId = getEnvId();
      const hit = list.find((e) => e.EnvId === envId || e.envId === envId);
      expect(hit || list[0]?.EnvId || list[0]?.envId).toBeTruthy();
      console.log("[A] EnvList size=", list.length, "target hit=", Boolean(hit));
    } finally {
      await closeMcp(session);
    }
  }, 90000);
});

describe.skipIf(run)("Mode A — skipped without credentials", () => {
  test("skip notice", () => {
    console.log(
      "[A] skipped — set MCP_E2E_MODE=apikey with MCP_E2E_API_KEY (or SECRET_ID/KEY) + MCP_E2E_ENV_ID",
    );
    expect(true).toBe(true);
  });
});
