import type { CloudApiRequestFn } from './types.js';
import { warn } from './utils/logger.js';

/** Loopback hosts only. WHATWG URL keeps the brackets on IPv6 hostnames. */
const ALLOWED_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

/** Upper bound for one cloud API call, so a hung endpoint cannot block a tool call forever. */
const ENDPOINT_TIMEOUT_MS = 30_000;

let announcedEndpoint: string | undefined;

/**
 * Validate and normalise CLOUDBASE_LOCAL_ENDPOINT.
 *
 * Setting this variable makes cloud API calls skip the login and credential
 * checks, so it must never point off the local machine.
 */
export function assertLocalEndpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('CLOUDBASE_LOCAL_ENDPOINT is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('CLOUDBASE_LOCAL_ENDPOINT must use http or https');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('CLOUDBASE_LOCAL_ENDPOINT must point at a loopback host');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/capi' || pathname.endsWith('/capi')) {
    throw new Error(
      'CLOUDBASE_LOCAL_ENDPOINT is the origin. Do not include /capi; it is appended automatically',
    );
  }
  return endpoint.replace(/\/+$/, '');
}

function localRequestError(url: string, action: string, reason: string): Error {
  return new Error(
    `CLOUDBASE_LOCAL_ENDPOINT request to ${url} failed for ${action}: ${reason}`,
  );
}

/**
 * Read and validate CLOUDBASE_LOCAL_ENDPOINT. Returns undefined when unset.
 *
 * A malformed value throws instead of silently falling back, so a bad config
 * surfaces as a config error rather than looking like an auth failure.
 */
export function resolveLocalEndpoint(): string | undefined {
  const raw = process.env.CLOUDBASE_LOCAL_ENDPOINT;
  if (!raw) {
    return undefined;
  }
  const base = assertLocalEndpoint(raw);
  if (announcedEndpoint !== base) {
    announcedEndpoint = base;
    warn(
      `CLOUDBASE_LOCAL_ENDPOINT is set: cloud API calls go to ${base} and the login/credential check is skipped`,
    );
  }
  return base;
}

/**
 * manager-node 5.8.8 routes both DatabaseService.executePGSql and
 * commonService().call through CloudService.request. That method delegates
 * to context.requestFn and skips TC3 when the function is set.
 */
export function createLocalCloudApiRequestFn(endpoint: string): CloudApiRequestFn {
  const base = assertLocalEndpoint(endpoint);
  return async ({ service, action, version, region, payload }) => {
    const url = `${base}/capi`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tc-action': action,
          'x-tc-version': version,
          'x-tc-region': region,
          'x-tc-service': service,
        },
        body: JSON.stringify(payload ?? {}),
        signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
        redirect: 'manual',
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw localRequestError(url, action, reason);
    }
    // With redirect: 'manual' a 3xx comes back as an opaque redirect (status 0)
    // instead of being followed, so both shapes must be rejected explicitly.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw localRequestError(url, action, `HTTP ${response.status} redirect`);
    }
    const text = await response.text();
    let body: { Response?: Record<string, unknown> };
    try {
      body = text ? JSON.parse(text) as { Response?: Record<string, unknown> } : {};
    } catch {
      throw localRequestError(url, action, `HTTP ${response.status} was not JSON`);
    }
    const inner = body.Response;
    if (!inner) {
      const error = localRequestError(url, action, `HTTP ${response.status} missing Response`);
      (error as Error & { code?: string }).code = 'InternalError';
      throw error;
    }
    const apiError = inner.Error as { Code?: string; Message?: string } | undefined;
    if (apiError) {
      const error = new Error(apiError.Message || apiError.Code || 'cloud api error');
      (error as Error & { code?: string }).code = apiError.Code;
      throw error;
    }
    return inner;
  };
}
