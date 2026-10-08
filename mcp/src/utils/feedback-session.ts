/**
 * In-process log of tool outcomes for an explicitly requested feedback draft.
 *
 * Hosted gateways may construct a new server object per request. The log is
 * therefore keyed by a hash of the credential when one is present, and only
 * falls back to the server object when no credential is available. The cache
 * is bounded. Arguments are never stored, and the raw credential is not stored.
 */

import { createHash } from "node:crypto";

export type ToolOutcome = {
  toolName: string;
  durationMs: number;
  failed: boolean;
  at: string;
};

type SessionBucket = {
  outcomes: ToolOutcome[];
  repeatPeak: number;
  touchedAt: number;
};

const MAX_OUTCOMES = 200;
const MAX_CREDENTIALS = 64;
const MAX_TOOL_NAME_LENGTH = 80;

const byCredential = new Map<string, SessionBucket>();
const byServer = new WeakMap<object, SessionBucket>();

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

function emptyBucket(): SessionBucket {
  return { outcomes: [], repeatPeak: 0, touchedAt: Date.now() };
}

function evictOldestCredential(): void {
  let oldestKey: string | undefined;
  let oldestTouched = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of byCredential) {
    if (bucket.touchedAt < oldestTouched) {
      oldestTouched = bucket.touchedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    byCredential.delete(oldestKey);
  }
}

function bucketFor(server: object): SessionBucket | undefined {
  if (!server || typeof server !== "object") {
    return undefined;
  }
  const key = credentialKey(server);
  if (key) {
    let bucket = byCredential.get(key);
    if (!bucket) {
      if (byCredential.size >= MAX_CREDENTIALS) {
        evictOldestCredential();
      }
      bucket = emptyBucket();
      byCredential.set(key, bucket);
    }
    bucket.touchedAt = Date.now();
    return bucket;
  }
  let bucket = byServer.get(server);
  if (!bucket) {
    bucket = emptyBucket();
    byServer.set(server, bucket);
  }
  return bucket;
}

export function recordToolOutcome(
  server: object,
  input: { toolName: string; durationMs: number; failed: boolean; at?: string },
): void {
  const bucket = bucketFor(server);
  if (!bucket) {
    return;
  }
  const toolName = typeof input.toolName === "string" ? input.toolName.trim() : "";
  if (!toolName) {
    return;
  }
  const durationMs = Number.isFinite(input.durationMs) && input.durationMs >= 0
    ? Math.round(input.durationMs)
    : 0;
  const at = typeof input.at === "string" && input.at.length > 0
    ? input.at
    : new Date().toISOString();
  bucket.outcomes.push({
    toolName: toolName.slice(0, MAX_TOOL_NAME_LENGTH),
    durationMs,
    failed: input.failed === true,
    at,
  });
  if (bucket.outcomes.length > MAX_OUTCOMES) {
    bucket.outcomes.splice(0, bucket.outcomes.length - MAX_OUTCOMES);
  }
}

export function readToolOutcomes(server: object): readonly ToolOutcome[] {
  return bucketFor(server)?.outcomes ?? [];
}

export function noteRepeatCount(server: object, count: number): void {
  const bucket = bucketFor(server);
  if (!bucket || !Number.isFinite(count) || count <= 0) {
    return;
  }
  const rounded = Math.round(count);
  if (rounded > bucket.repeatPeak) {
    bucket.repeatPeak = rounded;
  }
}

export function readRepeatPeak(server: object): number {
  return bucketFor(server)?.repeatPeak ?? 0;
}

export function clearToolOutcomes(server: object): void {
  const key = server && typeof server === "object" ? credentialKey(server) : undefined;
  if (key) {
    byCredential.delete(key);
    return;
  }
  if (server && typeof server === "object") {
    byServer.delete(server);
  }
}

export function __resetFeedbackSessionsForTests(): void {
  byCredential.clear();
}

export const FEEDBACK_SESSION_LIMIT = MAX_OUTCOMES;
export const FEEDBACK_CREDENTIAL_LIMIT = MAX_CREDENTIALS;
