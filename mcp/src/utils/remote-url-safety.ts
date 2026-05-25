import * as dns from "dns";
import * as net from "net";
import type { RequestOptions } from "http";
import { URL } from "url";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const DISALLOWED_ERROR_MESSAGE = "不安全的 URL 或目标为内网地址";

type LookupAddress = {
  address: string;
  family: number;
};

function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isIpv4InRange(ip: string, start: string, end: string): boolean {
  const ipNumber = ipv4ToNumber(ip);
  return ipNumber >= ipv4ToNumber(start) && ipNumber <= ipv4ToNumber(end);
}

function normalizeIpAddress(ip: string): string {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice(7);
    if (net.isIPv4(mappedIpv4)) {
      return mappedIpv4;
    }
  }
  return normalized;
}

export function isPrivateIP(ip: string): boolean {
  const normalizedIp = normalizeIpAddress(ip);

  if (!net.isIP(normalizedIp)) {
    return true;
  }

  if (net.isIPv4(normalizedIp)) {
    return [
      ["0.0.0.0", "0.255.255.255"],
      ["10.0.0.0", "10.255.255.255"],
      ["100.64.0.0", "100.127.255.255"],
      ["127.0.0.0", "127.255.255.255"],
      ["169.254.0.0", "169.254.255.255"],
      ["172.16.0.0", "172.31.255.255"],
      ["192.0.0.0", "192.0.0.255"],
      ["192.0.2.0", "192.0.2.255"],
      ["192.168.0.0", "192.168.255.255"],
      ["198.18.0.0", "198.19.255.255"],
      ["198.51.100.0", "198.51.100.255"],
      ["203.0.113.0", "203.0.113.255"],
      ["224.0.0.0", "255.255.255.255"],
    ].some(([start, end]) => isIpv4InRange(normalizedIp, start, end));
  }

  return normalizedIp === "::" ||
    normalizedIp === "::1" ||
    normalizedIp.startsWith("fc") ||
    normalizedIp.startsWith("fd") ||
    normalizedIp.startsWith("fe8") ||
    normalizedIp.startsWith("fe9") ||
    normalizedIp.startsWith("fea") ||
    normalizedIp.startsWith("feb") ||
    normalizedIp.startsWith("fec0:") ||
    normalizedIp.startsWith("ff") ||
    normalizedIp.startsWith("2001:db8:");
}

async function resolveSafeAddresses(hostname: string): Promise<LookupAddress[]> {
  let resolvedAddresses: dns.LookupAddress[];

  try {
    resolvedAddresses = await dns.promises.lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  if (resolvedAddresses.length === 0) {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  const normalizedAddresses = resolvedAddresses.map(({ address, family }) => ({
    address: normalizeIpAddress(address),
    family,
  }));

  if (normalizedAddresses.some(({ address }) => isPrivateIP(address))) {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  return normalizedAddresses.filter(
    (candidate, index, collection) =>
      collection.findIndex(
        ({ address, family }) => address === candidate.address && family === candidate.family,
      ) === index,
  );
}

function createPinnedLookup(addresses: LookupAddress[]): NonNullable<RequestOptions["lookup"]> {
  return ((hostname: string, options: any, callback: any) => {
    const normalizedOptions = typeof options === "number" ? { family: options } : (options ?? {});
    const family = normalizedOptions.family;
    const candidates = family === 4 || family === 6
      ? addresses.filter((address) => address.family === family)
      : addresses;

    if (candidates.length === 0) {
      const error = Object.assign(new Error(`No safe address resolved for ${hostname}`), {
        code: "ENOTFOUND",
      });
      callback(error);
      return;
    }

    if (normalizedOptions.all) {
      callback(null, candidates);
      return;
    }

    callback(null, candidates[0].address, candidates[0].family);
  }) as NonNullable<RequestOptions["lookup"]>;
}

export async function prepareSafeRemoteRequest(url: string): Promise<{
  requestUrl: URL;
  requestOptions?: Pick<RequestOptions, "lookup">;
}> {
  let requestUrl: URL;

  try {
    requestUrl = new URL(url);
  } catch {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  if (!ALLOWED_PROTOCOLS.has(requestUrl.protocol)) {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  const hostname = requestUrl.hostname;
  if (!hostname) {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  if (hostname.toLowerCase() === "localhost") {
    throw new Error(DISALLOWED_ERROR_MESSAGE);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(DISALLOWED_ERROR_MESSAGE);
    }
    return { requestUrl };
  }

  const safeAddresses = await resolveSafeAddresses(hostname);
  return {
    requestUrl,
    requestOptions: {
      lookup: createPinnedLookup(safeAddresses),
    },
  };
}

export async function assertRemoteUrlSafe(url: string): Promise<void> {
  await prepareSafeRemoteRequest(url);
}

export function getRemoteUrlSafetyErrorMessage(): string {
  return DISALLOWED_ERROR_MESSAGE;
}
