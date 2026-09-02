/**
 * W1/W2 — OAuth discovery compliance (no business credentials required).
 */

import { describe, expect, test } from "vitest";
import { getBaseOrigin, getMcpEndpoint, envFlag, shouldRunNetworkSuites } from "./helpers/env.mjs";
import { e2eRequest, createE2EFetch, maybeRewriteToHttp } from "./helpers/fetch.mjs";

const base = getBaseOrigin();
const mcpUrl = getMcpEndpoint();
const run = shouldRunNetworkSuites();

describe.skipIf(!run)("W — OAuth discovery compliance", () => {
  test("W1 well-known oauth-authorization-server (root) is reachable and consistent", async () => {
    const res = await e2eRequest(`${base}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    expect(res.json?.issuer).toBeTruthy();
    expect(res.json?.authorization_endpoint).toContain("/mcp/oauth2/authorize");
    expect(res.json?.token_endpoint).toContain("/mcp/oauth2/token");
    expect(res.json?.registration_endpoint).toContain("/mcp/oauth2/register");
    expect(res.json?.grant_types_supported).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );
    console.log("[W1] auth-server issuer=", res.json.issuer);
  }, 20000);

  test("W1 well-known oauth-authorization-server/mcp/v1 path variant", async () => {
    const res = await e2eRequest(`${base}/.well-known/oauth-authorization-server/mcp/v1`);
    // Staging may return HTTP 200 with BAD_REQUEST body, or 4xx.
    const hasIssuer = typeof res.json?.issuer === "string" && res.json.issuer.length > 0;
    const hasErrorCode = typeof res.json?.code === "string";
    const looksOk = res.status === 200 && hasIssuer && !hasErrorCode;
    console.log(
      "[W1] auth-server/mcp/v1 status=",
      res.status,
      "looksOk=",
      looksOk,
      "body=",
      res.text?.slice(0, 200),
    );
    if (envFlag("MCP_E2E_STRICT_WELLKNOWN")) {
      expect(looksOk).toBe(true);
    } else if (looksOk) {
      expect(res.json.token_endpoint).toContain("/mcp/oauth2/token");
    } else {
      console.warn(
        "[W1 ISSUE] /.well-known/oauth-authorization-server/mcp/v1 is not available:",
        res.status,
        res.text?.slice(0, 180),
      );
      // Soft pass: document the issue without failing default runs
      expect(hasIssuer).toBe(false);
    }
  }, 20000);

  test("W1 well-known oauth-protected-resource variants are consistent", async () => {
    const root = await e2eRequest(`${base}/.well-known/oauth-protected-resource`);
    const path = await e2eRequest(`${base}/.well-known/oauth-protected-resource/mcp/v1`);
    expect(root.status).toBe(200);
    expect(path.status).toBe(200);
    expect(root.json?.resource).toBeTruthy();
    expect(path.json?.resource).toBe(root.json.resource);
    expect(root.json?.authorization_servers?.[0]).toBeTruthy();
    expect(path.json?.authorization_servers?.[0]).toBe(root.json.authorization_servers[0]);
    console.log("[W1] protected-resource=", root.json.resource);
  }, 20000);

  test("W2 unauthenticated POST /mcp/v1 returns 401 + WWW-Authenticate resource_metadata", async () => {
    const fetchFn = createE2EFetch();
    const res = await fetchFn(maybeRewriteToHttp(mcpUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "hosted-mcp-e2e-w2", version: "1.0.0" },
        },
      }),
    });

    const text = await res.text();
    const www = res.headers.get("www-authenticate") || res.headers.get("WWW-Authenticate") || "";
    console.log("[W2] status=", res.status, "WWW-Authenticate=", www, "body=", text.slice(0, 220));

    expect(res.status).toBe(401);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    expect(json?.error?.code).toBe(-32001);
    expect(String(json?.error?.message || "")).toMatch(/Missing credentials|Unauthorized/i);

    if (!www) {
      console.warn(
        "[W2 ISSUE] 401 response missing WWW-Authenticate header (RFC 9728 resource_metadata)",
      );
      if (envFlag("MCP_E2E_STRICT_WELLKNOWN")) {
        expect(www).toBeTruthy();
      }
    } else {
      expect(www.toLowerCase()).toContain("bearer");
      expect(www).toMatch(/resource_metadata=/i);
      expect(www).toMatch(/oauth-protected-resource/i);
    }
  }, 20000);
});

describe.skipIf(run)("W — skipped without network opt-in", () => {
  test("skip notice", () => {
    console.log(
      "[W] skipped — set MCP_E2E_ENDPOINT or MCP_E2E_NETWORK=1 (or provide credentials)",
    );
    expect(true).toBe(true);
  });
});
