/**
 * Environment helpers for hosted MCP E2E.
 *
 * Modes (MCP_E2E_MODE):
 *   - apikey: static API key / SecretId+SecretKey
 *   - oauth: headless OAuth 2.1 (DCR + PKCE + apikey login + consent + token)
 *   - (unset): run discovery/negative suites; skip credentialed modes
 */

export const DEFAULT_ISSUER = "https://tcb-api.cloud.tencent.com";
export const DEFAULT_MCP_PATH = "/mcp/v1";

export function envFlag(name) {
  const v = process.env[name];
  return v === "1" || v === "true" || v === "yes";
}

export function getIssuer() {
  return (process.env.MCP_E2E_ISSUER || DEFAULT_ISSUER).replace(/\/$/, "");
}

/**
 * Prefer explicit MCP_E2E_ENDPOINT; otherwise derive from issuer.
 * Staging (no TLS on 443) should set http://... and MCP_E2E_TLS_INSECURE=1.
 */
export function getMcpEndpoint() {
  if (process.env.MCP_E2E_ENDPOINT) {
    return process.env.MCP_E2E_ENDPOINT.replace(/\/$/, "");
  }
  const issuer = getIssuer();
  // When TLS insecure + http preferred for staging hosts mapping
  if (envFlag("MCP_E2E_TLS_INSECURE") && issuer.startsWith("https:")) {
    return `http://${issuer.slice("https://".length)}${DEFAULT_MCP_PATH}`;
  }
  return `${issuer}${DEFAULT_MCP_PATH}`;
}

export function getBaseOrigin(url = getMcpEndpoint()) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

export function getMode() {
  return (process.env.MCP_E2E_MODE || "").trim().toLowerCase();
}

export function getEnvId() {
  return process.env.MCP_E2E_ENV_ID || "";
}

export function getApiKey() {
  return process.env.MCP_E2E_API_KEY || "";
}

export function getSecretPair() {
  return {
    secretId: process.env.MCP_E2E_SECRET_ID || "",
    secretKey: process.env.MCP_E2E_SECRET_KEY || "",
  };
}

export function hasApikeyCredentials() {
  const { secretId, secretKey } = getSecretPair();
  if (secretId && secretKey && getEnvId()) return true;
  if (getApiKey() && getEnvId()) return true;
  return false;
}

export function hasOauthCredentials() {
  return Boolean(getApiKey() && getEnvId());
}

export function shouldRunApikeyMode() {
  const mode = getMode();
  if (mode && mode !== "apikey") return false;
  return hasApikeyCredentials();
}

export function shouldRunOauthMode() {
  const mode = getMode();
  if (mode && mode !== "oauth") return false;
  return hasOauthCredentials();
}

export function authHeadersForApikey() {
  const headers = {};
  const { secretId, secretKey } = getSecretPair();
  if (secretId && secretKey) {
    headers["X-TencentCloud-SecretId"] = secretId;
    headers["X-TencentCloud-SecretKey"] = secretKey;
  } else if (getApiKey()) {
    headers.Authorization = `Bearer ${getApiKey()}`;
  }
  return headers;
}

export function dcrBurstCount() {
  const n = Number(process.env.MCP_E2E_DCR_BURST || "3");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/**
 * Anonymous network suites (W1/W2/N1/N2) only run when explicitly opted in
 * via MCP_E2E_ENDPOINT / MCP_E2E_NETWORK, or when credentials imply a live run.
 * Default (no env) → skip everything so CI / bare `vitest run` exits 0.
 */
export function shouldRunNetworkSuites() {
  if (envFlag("MCP_E2E_NETWORK")) return true;
  if (process.env.MCP_E2E_ENDPOINT) return true;
  if (hasApikeyCredentials() || hasOauthCredentials()) return true;
  return false;
}
