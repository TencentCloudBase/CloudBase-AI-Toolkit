/**
 * Headless OAuth 2.1 client for hosted MCP (no browser).
 * Flow: DCR → authorize → apikey verify → consent → token (PKCE)
 */

import { createHash, randomBytes } from "node:crypto";
import { getBaseOrigin, getEnvId, getApiKey, getIssuer } from "./env.mjs";
import { createE2EFetch, e2eRequest, maybeRewriteToHttp } from "./fetch.mjs";

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createPkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export async function registerClient({
  clientName = "cloudbase-hosted-mcp-e2e",
  redirectUri = "http://127.0.0.1:8765/callback",
} = {}) {
  const base = getBaseOrigin();
  const res = await e2eRequest(`${base}/mcp/oauth2/register`, {
    method: "POST",
    body: {
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  if (res.status !== 201 || !res.json?.client_id) {
    throw new Error(`DCR failed: ${res.status} ${res.text}`);
  }
  return { ...res.json, redirect_uri: redirectUri };
}

/**
 * Start authorize and extract session_id from redirect Location.
 */
export async function beginAuthorize({ clientId, redirectUri, challenge, state = "e2e" }) {
  const base = getBaseOrigin();
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "mcp:full",
    state,
  });
  const res = await e2eRequest(`${base}/mcp/oauth2/authorize?${q}`, {
    method: "GET",
    redirect: "manual",
  });
  const loc = maybeRewriteToHttp(res.location || "");
  if (!loc) {
    throw new Error(`authorize missing Location: ${res.status} ${res.text}`);
  }
  const sessionId = new URL(loc).searchParams.get("session_id");
  if (!sessionId) {
    throw new Error(`authorize Location missing session_id: ${loc}`);
  }
  return { sessionId, location: loc, status: res.status };
}

/**
 * Headless apikey login (replaces browser Tencent Cloud login).
 */
export async function verifyWithApiKey({ sessionId, envId = getEnvId(), apiKey = getApiKey() }) {
  const base = getBaseOrigin();
  const res = await e2eRequest(`${base}/mcp/oauth2/authorize/apikey`, {
    method: "POST",
    body: {
      session_id: sessionId,
      env_id: envId,
      api_key: apiKey,
    },
  });
  return res;
}

/**
 * Consent + env selection → authorization code via redirect.
 */
export async function submitConsent({ sessionId, envId = getEnvId(), regionId }) {
  const base = getBaseOrigin();
  const body = {
    session_id: sessionId,
    env_id: envId,
  };
  if (regionId) body.region_id = regionId;

  const res = await e2eRequest(`${base}/mcp/oauth2/authorize/consent`, {
    method: "POST",
    body,
    redirect: "manual",
  });

  const loc = maybeRewriteToHttp(res.location || "");
  let code = null;
  let state = null;
  if (loc) {
    try {
      const u = new URL(loc);
      code = u.searchParams.get("code");
      state = u.searchParams.get("state");
    } catch {
      // ignore
    }
  }
  // Some deployments may return JSON { code } instead of redirect
  if (!code && res.json?.code) {
    code = res.json.code;
  }
  return { ...res, code, state, callbackUrl: loc };
}

export async function exchangeAuthorizationCode({
  code,
  clientId,
  redirectUri,
  codeVerifier,
}) {
  const base = getBaseOrigin();
  const fetchFn = createE2EFetch();
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const tokenRes = await fetchFn(maybeRewriteToHttp(`${base}/mcp/oauth2/token`), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
  });
  const text = await tokenRes.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: tokenRes.status, json, text };
}

export async function refreshAccessToken({ refreshToken, clientId }) {
  const base = getBaseOrigin();
  const fetchFn = createE2EFetch();
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const tokenRes = await fetchFn(maybeRewriteToHttp(`${base}/mcp/oauth2/token`), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
  });
  const text = await tokenRes.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: tokenRes.status, json, text };
}

/**
 * Full headless OAuth → { accessToken, refreshToken, client, pkce, sessionId }
 */
export async function runHeadlessOauth() {
  const apiKey = getApiKey();
  const envId = getEnvId();
  if (!apiKey || !envId) {
    throw new Error("MCP_E2E_API_KEY and MCP_E2E_ENV_ID required for OAuth mode");
  }

  const pkce = createPkcePair();
  const client = await registerClient();
  const { sessionId } = await beginAuthorize({
    clientId: client.client_id,
    redirectUri: client.redirect_uri,
    challenge: pkce.challenge,
  });

  const verify = await verifyWithApiKey({ sessionId, envId, apiKey });
  if (verify.status !== 201 && verify.status !== 200) {
    throw new Error(`apikey verify failed: ${verify.status} ${verify.text}`);
  }

  const consent = await submitConsent({ sessionId, envId });
  if (!consent.code) {
    throw new Error(`consent missing code: ${consent.status} ${consent.text}`);
  }

  const token = await exchangeAuthorizationCode({
    code: consent.code,
    clientId: client.client_id,
    redirectUri: client.redirect_uri,
    codeVerifier: pkce.verifier,
  });
  if (token.status !== 200 || !token.json?.access_token) {
    throw new Error(`token exchange failed: ${token.status} ${token.text}`);
  }

  return {
    accessToken: token.json.access_token,
    refreshToken: token.json.refresh_token,
    tokenType: token.json.token_type,
    expiresIn: token.json.expires_in,
    client,
    pkce,
    sessionId,
    issuer: getIssuer(),
  };
}

/**
 * Build a forged RS256-looking JWT with invalid JSON payload (N1).
 */
export function forgeInvalidPayloadJwt() {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(Buffer.from("not-json"));
  return `${header}.${payload}.fakesig`;
}
