export type GatewayUpstreamResourceType =
  | "SCF"
  | "WEB_SCF"
  | "CBR"
  | "STATIC_STORE"
  | "LH"
  | string;

export type GatewayAccessUrlSource =
  | "gateway.custom"
  | "gateway.default";

export type GatewayRouteUrlCandidate = {
  Domain: string;
  Path?: string;
  IsDefault?: boolean;
  Enable?: boolean;
  UpstreamResourceType?: string;
  UpstreamResourceName?: string;
};

export type RankedGatewayAccessUrl = {
  url: string;
  domain: string;
  path: string;
  isDefault: boolean;
  source: GatewayAccessUrlSource;
  enabled: boolean;
};

export type ResolveGatewayAccessUrlsResult = {
  accessUrl?: string;
  accessUrls: string[];
  accessUrlSource?: GatewayAccessUrlSource;
  routes: RankedGatewayAccessUrl[];
  /** Ranked URLs for routes with Enable === false (diagnostic only). */
  disabledAccessUrls: string[];
};

export type PreferGatewayOrFallbackResult = {
  accessUrl?: string;
  accessUrls: string[];
  accessUrlSource?: string;
  accessUrlReachable: boolean;
  disabledAccessUrls: string[];
};

/** Route is reachable unless Enable is explicitly false. */
export function isGatewayRouteEnabled(route: {
  Enable?: boolean;
}): boolean {
  return route.Enable !== false;
}

function normalizeAccessPath(path: string | undefined): string {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function buildHttpsUrl(domain: string, path: string): string {
  return `https://${domain}${normalizeAccessPath(path)}`;
}

function extractHostname(urlOrHost: string): string {
  const trimmed = urlOrHost.trim();
  if (!trimmed) {
    return "";
  }
  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).hostname.toLowerCase();
    }
  } catch {
    // Fall through to treat as bare hostname.
  }
  return trimmed.replace(/\/.*$/, "").toLowerCase();
}

/**
 * Whether a hostname has an enabled covering gateway route for the given path.
 * Longest matching Path prefix wins. Missing route info → unknown (null).
 */
export function isDomainPathReachableViaGateway(
  routes: GatewayRouteUrlCandidate[],
  domainOrUrl: string,
  requestPath?: string,
): boolean | null {
  const hostname = extractHostname(domainOrUrl);
  if (!hostname) {
    return null;
  }
  const normalizedRequest = normalizeAccessPath(requestPath);
  const domainRoutes = routes.filter(
    (route) =>
      Boolean(route.Domain) &&
      route.Domain.toLowerCase() === hostname,
  );
  if (domainRoutes.length === 0) {
    return null;
  }

  const covering = domainRoutes
    .map((route) => ({
      route,
      path: normalizeAccessPath(route.Path),
    }))
    .filter(({ path }) => {
      if (path === "/") {
        return true;
      }
      return (
        normalizedRequest === path ||
        normalizedRequest.startsWith(
          path.endsWith("/") ? path : `${path}/`,
        )
      );
    })
    .sort((a, b) => b.path.length - a.path.length);

  if (covering.length === 0) {
    return null;
  }

  return isGatewayRouteEnabled(covering[0].route);
}

/**
 * Rank gateway route URLs: custom domains (IsDefault !== true) before default domain.
 * By default skips Enable === false routes. Stable within each group; dedupe by full URL.
 */
export function rankGatewayAccessUrls(
  routes: GatewayRouteUrlCandidate[],
  options?: { includeDisabled?: boolean },
): RankedGatewayAccessUrl[] {
  const includeDisabled = options?.includeDisabled === true;
  const mapped = routes
    .filter((route) => Boolean(route.Domain))
    .filter((route) => includeDisabled || isGatewayRouteEnabled(route))
    .map((route) => {
      const path = normalizeAccessPath(route.Path);
      const isDefault = route.IsDefault === true;
      return {
        url: buildHttpsUrl(route.Domain, path),
        domain: route.Domain,
        path,
        isDefault,
        enabled: isGatewayRouteEnabled(route),
        source: (isDefault
          ? "gateway.default"
          : "gateway.custom") as GatewayAccessUrlSource,
      };
    });

  mapped.sort((a, b) => {
    if (a.isDefault === b.isDefault) {
      return 0;
    }
    return a.isDefault ? 1 : -1;
  });

  const seen = new Set<string>();
  const deduped: RankedGatewayAccessUrl[] = [];
  for (const item of mapped) {
    if (seen.has(item.url)) {
      continue;
    }
    seen.add(item.url);
    deduped.push(item);
  }
  return deduped;
}

export function flattenHttpServiceRoutes(result: {
  Domains?: Array<{
    Domain?: string;
    IsDefault?: boolean;
    Routes?: Array<Record<string, unknown>>;
  }>;
}): GatewayRouteUrlCandidate[] {
  return (result.Domains ?? []).flatMap((domainItem) =>
    (domainItem.Routes ?? []).map((route) => ({
      Domain: domainItem.Domain ?? "",
      IsDefault: domainItem.IsDefault,
      Path: typeof route.Path === "string" ? route.Path : undefined,
      Enable:
        typeof route.Enable === "boolean" ? route.Enable : undefined,
      UpstreamResourceType:
        typeof route.UpstreamResourceType === "string"
          ? route.UpstreamResourceType
          : undefined,
      UpstreamResourceName:
        typeof route.UpstreamResourceName === "string"
          ? route.UpstreamResourceName
          : undefined,
    })),
  );
}

export function filterRoutesByUpstream(
  routes: GatewayRouteUrlCandidate[],
  input: {
    upstreamResourceName: string;
    upstreamResourceTypes?: GatewayUpstreamResourceType[];
  },
): GatewayRouteUrlCandidate[] {
  const name = input.upstreamResourceName;
  const types = input.upstreamResourceTypes?.map((t) => String(t));
  return routes.filter((route) => {
    if (route.UpstreamResourceName !== name) {
      return false;
    }
    if (!types || types.length === 0) {
      return true;
    }
    return Boolean(
      route.UpstreamResourceType &&
        types.includes(String(route.UpstreamResourceType)),
    );
  });
}

export function toAccessUrlEnvelope(
  ranked: RankedGatewayAccessUrl[],
  disabledAccessUrls: string[] = [],
): ResolveGatewayAccessUrlsResult {
  const enabled = ranked.filter((item) => item.enabled);
  if (enabled.length === 0) {
    return {
      accessUrls: [],
      routes: [],
      disabledAccessUrls,
    };
  }
  return {
    accessUrl: enabled[0].url,
    accessUrls: enabled.map((item) => item.url),
    accessUrlSource: enabled[0].source,
    routes: enabled,
    disabledAccessUrls,
  };
}

type CloudBaseManagerLike = {
  env: {
    describeHttpServiceRoute: (params: {
      EnvId: string;
      Limit?: number;
    }) => Promise<{
      Domains?: Array<{
        Domain?: string;
        IsDefault?: boolean;
        Routes?: Array<Record<string, unknown>>;
      }>;
    }>;
  };
};

async function loadHttpServiceRoutes(
  getManager: () => Promise<CloudBaseManagerLike>,
  envId: string,
): Promise<GatewayRouteUrlCandidate[]> {
  const manager = await getManager();
  const result = await manager.env.describeHttpServiceRoute({
    EnvId: envId,
    Limit: 1000,
  });
  return flattenHttpServiceRoutes(result);
}

/**
 * Best-effort lookup of gateway access URLs for an upstream resource.
 * Never throws — returns empty lists on failure.
 * Disabled routes (Enable === false) are excluded from accessUrl(s).
 */
export async function resolveGatewayAccessUrls(input: {
  envId: string;
  upstreamResourceName: string;
  upstreamResourceTypes?: GatewayUpstreamResourceType[];
  getManager: () => Promise<CloudBaseManagerLike>;
}): Promise<ResolveGatewayAccessUrlsResult> {
  try {
    const flattened = await loadHttpServiceRoutes(
      input.getManager,
      input.envId,
    );
    const matched = filterRoutesByUpstream(flattened, {
      upstreamResourceName: input.upstreamResourceName,
      upstreamResourceTypes: input.upstreamResourceTypes,
    });
    const disabledAccessUrls = rankGatewayAccessUrls(matched, {
      includeDisabled: true,
    })
      .filter((item) => !item.enabled)
      .map((item) => item.url);
    return toAccessUrlEnvelope(
      rankGatewayAccessUrls(matched),
      disabledAccessUrls,
    );
  } catch {
    return { accessUrls: [], routes: [], disabledAccessUrls: [] };
  }
}

/**
 * Load all flattened HTTP service routes (best-effort). Used by hosting to
 * judge whether the static-domain fallback itself is gateway-disabled.
 */
export async function resolveAllGatewayRoutes(input: {
  envId: string;
  getManager: () => Promise<CloudBaseManagerLike>;
}): Promise<GatewayRouteUrlCandidate[]> {
  try {
    return await loadHttpServiceRoutes(input.getManager, input.envId);
  } catch {
    return [];
  }
}

/**
 * Merge ranked gateway URLs with a resource-native fallback URL.
 * Gateway custom/default always win over the fallback when present.
 * Unreachable fallbacks are omitted from accessUrl(s) and listed under
 * disabledAccessUrls instead.
 */
export function preferGatewayOrFallback(input: {
  gateway: ResolveGatewayAccessUrlsResult;
  fallbackUrl?: string;
  fallbackSource?: string;
  /** When false, fallback is treated as GATEWAY_ROUTE_DISABLED. Default true. */
  fallbackReachable?: boolean;
}): PreferGatewayOrFallbackResult {
  const disabledAccessUrls = [
    ...(input.gateway.disabledAccessUrls ?? []),
  ];
  const fallbackReachable = input.fallbackReachable !== false;

  if (input.gateway.accessUrl) {
    const urls = [...input.gateway.accessUrls];
    if (
      input.fallbackUrl &&
      fallbackReachable &&
      !urls.includes(input.fallbackUrl)
    ) {
      urls.push(input.fallbackUrl);
    } else if (
      input.fallbackUrl &&
      !fallbackReachable &&
      !disabledAccessUrls.includes(input.fallbackUrl)
    ) {
      disabledAccessUrls.push(input.fallbackUrl);
    }
    return {
      accessUrl: input.gateway.accessUrl,
      accessUrls: urls,
      accessUrlSource: input.gateway.accessUrlSource,
      accessUrlReachable: true,
      disabledAccessUrls,
    };
  }

  if (input.fallbackUrl && fallbackReachable) {
    return {
      accessUrl: input.fallbackUrl,
      accessUrls: [input.fallbackUrl],
      accessUrlSource: input.fallbackSource,
      accessUrlReachable: true,
      disabledAccessUrls,
    };
  }

  if (input.fallbackUrl && !fallbackReachable) {
    if (!disabledAccessUrls.includes(input.fallbackUrl)) {
      disabledAccessUrls.push(input.fallbackUrl);
    }
  }

  return {
    accessUrls: [],
    accessUrlReachable: false,
    disabledAccessUrls,
  };
}
