import { describe, expect, it, beforeEach } from "vitest";
import {
  HOSTED_CLIENT_INFO_CACHE_CAPACITY,
  HOSTED_CLIENT_INFO_CACHE_TTL_MS,
  __hostedClientInfoCacheSizeForTests,
  __resetHostedClientInfoCacheForTests,
  readHostedClientInfo,
  rememberHostedClientInfo,
} from "./client-info-cache.js";

describe("hosted clientInfo cache", () => {
  beforeEach(() => {
    __resetHostedClientInfoCacheForTests();
  });

  it("stores only name and version for a credential hash", () => {
    rememberHostedClientInfo("hash-a", { name: "cursor", version: "1.0.0" }, 1_000);
    expect(readHostedClientInfo("hash-a", 1_000)).toEqual({
      name: "cursor",
      version: "1.0.0",
    });
    expect(readHostedClientInfo("hash-b", 1_000)).toBeUndefined();
    expect(JSON.stringify(readHostedClientInfo("hash-a", 1_000))).not.toContain("secret");
  });

  it("expires entries after the TTL constant", () => {
    const writtenAt = 5_000;
    rememberHostedClientInfo("hash-a", { name: "cursor", version: "1" }, writtenAt);
    expect(
      readHostedClientInfo("hash-a", writtenAt + HOSTED_CLIENT_INFO_CACHE_TTL_MS),
    ).toEqual({ name: "cursor", version: "1" });
    expect(
      readHostedClientInfo("hash-a", writtenAt + HOSTED_CLIENT_INFO_CACHE_TTL_MS + 1),
    ).toBeUndefined();
  });

  it("evicts the least recently used entry past capacity", () => {
    for (let i = 0; i < HOSTED_CLIENT_INFO_CACHE_CAPACITY; i += 1) {
      rememberHostedClientInfo(`hash-${i}`, { name: `client-${i}` }, i);
    }
    readHostedClientInfo("hash-0", HOSTED_CLIENT_INFO_CACHE_CAPACITY);
    rememberHostedClientInfo("hash-new", { name: "newest" }, HOSTED_CLIENT_INFO_CACHE_CAPACITY + 1);
    expect(__hostedClientInfoCacheSizeForTests()).toBe(HOSTED_CLIENT_INFO_CACHE_CAPACITY);
    expect(readHostedClientInfo("hash-0", HOSTED_CLIENT_INFO_CACHE_CAPACITY + 1)?.name).toBe("client-0");
    expect(readHostedClientInfo("hash-1", HOSTED_CLIENT_INFO_CACHE_CAPACITY + 1)).toBeUndefined();
    expect(readHostedClientInfo("hash-new", HOSTED_CLIENT_INFO_CACHE_CAPACITY + 1)?.name).toBe("newest");
  });
});
