/**
 * Mode B — headless OAuth 2.1 + T1 refresh_token.
 * Skips when MCP_E2E_API_KEY / MCP_E2E_ENV_ID are absent.
 */

import { describe, expect, test } from "vitest";
import { shouldRunOauthMode } from "./helpers/env.mjs";
import { closeMcp, connectHostedMcpClient } from "./helpers/mcp-client.mjs";
import {
  refreshAccessToken,
  runHeadlessOauth,
} from "./helpers/oauth-headless.mjs";

const run = shouldRunOauthMode();

describe.skipIf(!run)("Mode B — headless OAuth", () => {
  /** @type {Awaited<ReturnType<typeof runHeadlessOauth>> | null} */
  let oauth = null;

  test("B1 DCR→apikey→consent→token→initialize+tools/list", async () => {
    oauth = await runHeadlessOauth();
    expect(oauth.accessToken).toBeTruthy();
    console.log(
      "[B1] got access_token len=",
      oauth.accessToken.length,
      "refresh=",
      Boolean(oauth.refreshToken),
    );

    const session = await connectHostedMcpClient({
      headers: { Authorization: `Bearer ${oauth.accessToken}` },
      clientName: "hosted-mcp-e2e-oauth",
    });
    try {
      const tools = await session.client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
      console.log("[B1] tools/list count=", tools.tools.length);
    } finally {
      await closeMcp(session);
    }
  }, 120000);

  test("T1 refresh_token grant yields usable access_token", async () => {
    expect(oauth?.refreshToken).toBeTruthy();
    const oldAccess = oauth.accessToken;
    const refreshed = await refreshAccessToken({
      refreshToken: oauth.refreshToken,
      clientId: oauth.client.client_id,
    });
    console.log("[T1] refresh status=", refreshed.status, "body keys=", Object.keys(refreshed.json || {}));
    expect(refreshed.status).toBe(200);
    expect(refreshed.json?.access_token).toBeTruthy();

    const newAccess = refreshed.json.access_token;
    console.log(
      "[T1] old===new?",
      oldAccess === newAccess,
      "old still usable? (probe below)",
    );

    const session = await connectHostedMcpClient({
      headers: { Authorization: `Bearer ${newAccess}` },
      clientName: "hosted-mcp-e2e-refresh",
    });
    try {
      const tools = await session.client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    } finally {
      await closeMcp(session);
    }

    // Probe old token behavior for PR notes (do not hard-fail either way)
    try {
      const oldSession = await connectHostedMcpClient({
        headers: { Authorization: `Bearer ${oldAccess}` },
        clientName: "hosted-mcp-e2e-old-token",
      });
      await oldSession.client.listTools();
      console.log("[T1] old access_token still works after refresh");
      await closeMcp(oldSession);
    } catch (err) {
      console.log(
        "[T1] old access_token rejected after refresh:",
        String(err?.message || err).slice(0, 200),
      );
    }
  }, 120000);
});

describe.skipIf(run)("Mode B — skipped without credentials", () => {
  test("skip notice", () => {
    console.log(
      "[B] skipped — set MCP_E2E_MODE=oauth with MCP_E2E_API_KEY + MCP_E2E_ENV_ID",
    );
    expect(true).toBe(true);
  });
});
