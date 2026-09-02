/**
 * Fetch wrapper for hosted MCP E2E.
 * - MCP_E2E_TLS_INSECURE=1 → undici Agent(connect.rejectUnauthorized=false)
 * - Prefer http when endpoint/issuer is http, and rewrite https→http on redirects
 *   (staging Location headers often advertise https:// even when 443 has no TLS)
 */

import { envFlag, getMcpEndpoint } from "./env.mjs";
import { loadUndici } from "./undici-loader.mjs";

let insecureAgent;
let undiciMod;
let undiciReady;

async function ensureUndici() {
  if (undiciReady) return undiciReady;
  undiciReady = (async () => {
    undiciMod = await loadUndici();
    if (envFlag("MCP_E2E_TLS_INSECURE") && !insecureAgent) {
      insecureAgent = new undiciMod.Agent({
        connect: { rejectUnauthorized: false },
      });
    }
    return undiciMod;
  })();
  return undiciReady;
}

export function prefersHttp() {
  const endpoint = getMcpEndpoint();
  return endpoint.startsWith("http:") || envFlag("MCP_E2E_FORCE_HTTP");
}

export function maybeRewriteToHttp(url) {
  const s = typeof url === "string" ? url : url.toString();
  if (prefersHttp() && s.startsWith("https:")) {
    return `http:${s.slice("https:".length)}`;
  }
  return s;
}

/**
 * Returns a FetchLike function compatible with StreamableHTTPClientTransport.
 */
export function createE2EFetch() {
  return async function e2eFetch(input, init = {}) {
    await ensureUndici();
    const raw =
      typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const url = maybeRewriteToHttp(raw);
    const opts = { ...init };
    if (envFlag("MCP_E2E_TLS_INSECURE") && insecureAgent) {
      opts.dispatcher = insecureAgent;
    }
    return undiciMod.fetch(url, opts);
  };
}

/**
 * Low-level JSON helper using the E2E fetch.
 */
export async function e2eRequest(
  pathOrUrl,
  { method = "GET", headers = {}, body, redirect = "manual" } = {},
) {
  const fetchFn = createE2EFetch();
  const url = pathOrUrl.startsWith("http")
    ? maybeRewriteToHttp(pathOrUrl)
    : maybeRewriteToHttp(new URL(pathOrUrl, getMcpEndpoint()).toString());

  const res = await fetchFn(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: res.status,
    headers: res.headers,
    text,
    json,
    location: res.headers.get("location") || res.headers.get("Location") || "",
  };
}
