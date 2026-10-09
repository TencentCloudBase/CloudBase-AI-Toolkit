/**
 * Credential identity for process-local caches.
 *
 * Hosted gateways may construct a new server object per request. The
 * repeat-error guard and the hosted client-info cache key off a hash of
 * site, secretId, and token so they follow the credential rather than the
 * server object. The raw credential is not stored.
 */

import { createHash } from "node:crypto";

type CredentialSource = {
  cloudBaseOptions?: {
    secretId?: string;
    token?: string;
    site?: string;
  };
};

export function hashCredentialParts(parts: {
  secretId?: string;
  token?: string;
  site?: string;
}): string | undefined {
  const secretId = typeof parts.secretId === "string" ? parts.secretId.trim() : "";
  if (!secretId) {
    return undefined;
  }
  const token = typeof parts.token === "string" ? parts.token.trim() : "";
  const site = typeof parts.site === "string" ? parts.site.trim() : "";
  return createHash("sha256").update(`${site}\n${secretId}\n${token}`).digest("hex");
}

export function credentialKey(server: object): string | undefined {
  const options = (server as CredentialSource).cloudBaseOptions;
  return hashCredentialParts({
    secretId: options?.secretId,
    token: options?.token,
    site: options?.site,
  });
}
