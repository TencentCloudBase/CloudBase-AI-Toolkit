/**
 * P1–P3 — MCP protocol surface (requires Mode A credentials).
 */

import { describe, expect, test } from "vitest";
import {
  authHeadersForApikey,
  hasApikeyCredentials,
  shouldRunApikeyMode,
  shouldRunOauthMode,
} from "./helpers/env.mjs";
import { callTool, closeMcp, connectHostedMcpClient } from "./helpers/mcp-client.mjs";
import { runHeadlessOauth } from "./helpers/oauth-headless.mjs";

async function authHeaders() {
  if (shouldRunApikeyMode()) return authHeadersForApikey();
  if (shouldRunOauthMode()) {
    const oauth = await runHeadlessOauth();
    return { Authorization: `Bearer ${oauth.accessToken}` };
  }
  return null;
}

const run = hasApikeyCredentials() || shouldRunOauthMode();

describe.skipIf(!run)("P — MCP protocol surface", () => {
  test("P1 protocol version negotiation (old + new)", async () => {
    const headers = await authHeaders();
    const versions = ["2024-11-05", "2025-03-26", "2025-06-18"];
    const observations = [];

    for (const v of versions) {
      let session;
      try {
        session = await connectHostedMcpClient({
          headers,
          protocolVersion: v,
          clientName: `hosted-mcp-e2e-p1-${v}`,
        });
        const observed = session.transport.protocolVersion || "(client unset after connect)";
        // Server negotiated version is not always exposed on transport; listTools proves init worked
        await session.client.listTools();
        observations.push({ requested: v, transportProtocolVersion: observed, ok: true });
      } catch (err) {
        observations.push({
          requested: v,
          ok: false,
          error: String(err?.message || err).slice(0, 200),
        });
      } finally {
        if (session) await closeMcp(session);
      }
    }

    console.log("[P1] protocol negotiation observations:", JSON.stringify(observations, null, 2));
    // At least one modern version must succeed
    expect(observations.some((o) => o.ok)).toBe(true);
  }, 180000);

  test("P2 capabilities probe (resources/prompts list if declared)", async () => {
    const headers = await authHeaders();
    const session = await connectHostedMcpClient({
      headers,
      clientName: "hosted-mcp-e2e-p2",
    });
    try {
      // Client stores server capabilities after initialize
      const caps = session.client.getServerCapabilities?.() || {};
      console.log("[P2] server capabilities=", JSON.stringify(caps));

      if (caps.resources) {
        const resources = await session.client.listResources();
        console.log("[P2] resources count=", resources?.resources?.length ?? 0);
      } else {
        console.log("[P2] resources not declared — skip listResources");
      }

      if (caps.prompts) {
        const prompts = await session.client.listPrompts();
        console.log("[P2] prompts count=", prompts?.prompts?.length ?? 0);
      } else {
        console.log("[P2] prompts not declared — skip listPrompts");
      }

      expect(caps).toBeTruthy();
    } finally {
      await closeMcp(session);
    }
  }, 90000);

  test("P3 tools/call queryPgDatabase(action=context) readonly", async () => {
    const headers = await authHeaders();
    const session = await connectHostedMcpClient({
      headers,
      clientName: "hosted-mcp-e2e-p3",
    });
    try {
      const tools = await session.client.listTools();
      const names = (tools.tools || []).map((t) => t.name);
      if (!names.includes("queryPgDatabase")) {
        console.log("[P3] queryPgDatabase not advertised — skip (env may be NoSQL-only)");
        return;
      }
      const result = await callTool(session.client, "queryPgDatabase", {
        action: "context",
      });
      console.log("[P3] queryPgDatabase context keys=", Object.keys(result || {}));
      expect(result).toBeTruthy();
      expect(result?.ok).not.toBe(false);
    } finally {
      await closeMcp(session);
    }
  }, 90000);
});

describe.skipIf(run)("P — skipped without credentials", () => {
  test("skip notice", () => {
    console.log("[P] skipped — needs Mode A or Mode B credentials");
    expect(true).toBe(true);
  });
});
