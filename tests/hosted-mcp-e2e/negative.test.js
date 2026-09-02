/**
 * N1/N2/N3 — negative cases for hosted MCP OAuth / auth.
 */

import { describe, expect, test } from "vitest";
import {
  dcrBurstCount,
  getEnvId,
  hasApikeyCredentials,
  authHeadersForApikey,
  getApiKey,
  getBaseOrigin,
  shouldRunNetworkSuites,
} from "./helpers/env.mjs";
import { e2eRequest } from "./helpers/fetch.mjs";
import {
  beginAuthorize,
  createPkcePair,
  forgeInvalidPayloadJwt,
  registerClient,
  verifyWithApiKey,
} from "./helpers/oauth-headless.mjs";
import { callTool, closeMcp, connectHostedMcpClient } from "./helpers/mcp-client.mjs";

const base = getBaseOrigin();
const runNetwork = shouldRunNetworkSuites();

describe.skipIf(!runNetwork)("N — negative cases", () => {
  test("N1 forged JWT payload → 400 invalid_grant API Key format error", async () => {
    const pkce = createPkcePair();
    const client = await registerClient({ clientName: "hosted-mcp-e2e-n1" });
    const { sessionId } = await beginAuthorize({
      clientId: client.client_id,
      redirectUri: client.redirect_uri,
      challenge: pkce.challenge,
    });

    const fake = forgeInvalidPayloadJwt();
    const res = await verifyWithApiKey({
      sessionId,
      envId: getEnvId() || "mcp-pg-ky5u9q-d9godppox77cd5507",
      apiKey: fake,
    });

    console.log("[N1] status=", res.status, "body=", res.text);
    expect(res.status).toBe(400);
    expect(res.json?.error).toBe("invalid_grant");
    expect(String(res.json?.error_description || "")).toMatch(/API Key format error/i);
  }, 30000);

  test("N2 DCR rate-limit burst (configurable)", async () => {
    const burst = dcrBurstCount();
    const statuses = [];
    for (let i = 0; i < burst; i++) {
      const res = await e2eRequest(`${base}/mcp/oauth2/register`, {
        method: "POST",
        body: {
          client_name: `hosted-mcp-e2e-rl-${Date.now()}-${i}`,
          redirect_uris: ["http://127.0.0.1:8765/callback"],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });
      statuses.push(res.status);
      if (res.status === 429) break;
    }
    console.log("[N2] burst=", burst, "statuses=", statuses.join(","));

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s) => s === 201 || s === 429 || s === 400)).toBe(true);

    if (burst > 60) {
      expect(statuses.some((s) => s === 429)).toBe(true);
    } else {
      // CI / default: small sample smoke only
      console.log(
        "[N2] small sample — skip hard 429 assertion (set MCP_E2E_DCR_BURST=61+ to enforce)",
      );
    }
  }, 120000);

  test.skipIf(!hasApikeyCredentials())(
    "N3 unknown env_id is rejected with locatable error",
    async () => {
      const fakeEnv = `env-does-not-exist-${Date.now()}`;
      let session;
      try {
        session = await connectHostedMcpClient({
          headers: authHeadersForApikey(),
          envId: fakeEnv,
        });
        const result = await callTool(session.client, "queryEnv", { action: "list" });
        console.log("[N3] unexpected success payload keys=", Object.keys(result || {}));
        // Some deployments may still connect but tool returns error
        const text = JSON.stringify(result);
        expect(text.toLowerCase()).toMatch(/env|not found|invalid|denied|forbidden|error/);
      } catch (err) {
        const msg = String(err?.message || err);
        console.log("[N3] rejected as expected:", msg.slice(0, 240));
        expect(msg.length).toBeGreaterThan(0);
        // Must not leak stack traces / internal redis keys
        expect(msg).not.toMatch(/redis|ECONNREFUSED|at Object\./i);
      } finally {
        if (session) await closeMcp(session);
      }

      // Also probe apikey authorize with bad env when API key present
      if (getApiKey()) {
        const pkce = createPkcePair();
        const client = await registerClient({ clientName: "hosted-mcp-e2e-n3" });
        const { sessionId } = await beginAuthorize({
          clientId: client.client_id,
          redirectUri: client.redirect_uri,
          challenge: pkce.challenge,
        });
        const res = await verifyWithApiKey({
          sessionId,
          envId: fakeEnv,
          apiKey: getApiKey(),
        });
        console.log("[N3] apikey login status=", res.status, res.text?.slice(0, 200));
        expect([400, 401, 403, 404]).toContain(res.status);
      }
    },
    60000,
  );
});

describe.skipIf(runNetwork)("N — skipped without network opt-in", () => {
  test("skip notice", () => {
    console.log(
      "[N] skipped — set MCP_E2E_ENDPOINT or MCP_E2E_NETWORK=1 (or provide credentials)",
    );
    expect(true).toBe(true);
  });
});
