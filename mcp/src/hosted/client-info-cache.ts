/**
 * Bounded memory of MCP client name/version, keyed by a credential hash.
 *
 * Process-level mutable state: one Map. Each value is `{ name, version, writtenAt }`.
 * The map does not store servers, transports, or raw credentials.
 */

export const HOSTED_CLIENT_INFO_CACHE_CAPACITY = 256;
export const HOSTED_CLIENT_INFO_CACHE_TTL_MS = 60 * 60 * 1000;

export type HostedClientInfoRecord = {
  name: string;
  version?: string;
};

type CacheEntry = HostedClientInfoRecord & {
  writtenAt: number;
};

const entries = new Map<string, CacheEntry>();

export function rememberHostedClientInfo(
  key: string,
  value: HostedClientInfoRecord,
  now = Date.now(),
): void {
  const name = value.name.trim();
  if (!key || !name) {
    return;
  }
  const version = typeof value.version === "string" ? value.version.trim() : "";
  if (entries.has(key)) {
    entries.delete(key);
  }
  entries.set(key, {
    name,
    ...(version ? { version } : {}),
    writtenAt: now,
  });
  while (entries.size > HOSTED_CLIENT_INFO_CACHE_CAPACITY) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    entries.delete(oldest);
  }
}

export function readHostedClientInfo(
  key: string,
  now = Date.now(),
): HostedClientInfoRecord | undefined {
  const entry = entries.get(key);
  if (!entry) {
    return undefined;
  }
  if (now - entry.writtenAt > HOSTED_CLIENT_INFO_CACHE_TTL_MS) {
    entries.delete(key);
    return undefined;
  }
  entries.delete(key);
  entries.set(key, entry);
  return {
    name: entry.name,
    ...(entry.version ? { version: entry.version } : {}),
  };
}

export function __resetHostedClientInfoCacheForTests(): void {
  entries.clear();
}

export function __hostedClientInfoCacheSizeForTests(): number {
  return entries.size;
}
