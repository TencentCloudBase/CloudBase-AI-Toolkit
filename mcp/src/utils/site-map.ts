import { readProjectConfig } from "./project-config.js";

export type SiteId = "domestic" | "intl";

export interface SiteDefinition {
  id: SiteId;
  label: string;
  authHost: string;
  consoleHost: string;
  /** OAuth device-flow 后端端点（toolbox getOAuthEndpoint 可覆写；默认值与站点对应） */
  oauthEndpoint?: string;
  defaultRegion: string;
  regions: string[];
  capabilities: {
    noSql: boolean;
  };
}

export interface SiteResolution {
  site: SiteId;
  region: string;
  ambiguous?: boolean;
}

export const SITE_REGION_MAP: Record<SiteId, SiteDefinition> = {
  domestic: {
    id: "domestic",
    label: "国内站",
    authHost: "tcb.cloud.tencent.com",
    consoleHost: "tcb.cloud.tencent.com",
    oauthEndpoint: "https://tcb-api.cloud.tencent.com/qcloud-tcb/v1/oauth",
    defaultRegion: "ap-shanghai",
    regions: ["ap-shanghai", "ap-guangzhou", "ap-singapore"],
    capabilities: { noSql: true },
  },
  intl: {
    id: "intl",
    label: "国际站",
    authHost: "tcb.tencentcloud.com",
    consoleHost: "tcb.tencentcloud.com",
    // 2026-09-01 实测：device/code + token 端点可用，且 device-code 注册表与国内站隔离
    // （国内站有效期内的 code 在该端点轮询返回 expired_token）
    oauthEndpoint: "https://tcb-api.tencentcloud.com/qcloud-tcb/v1/oauth",
    defaultRegion: "ap-singapore",
    regions: ["ap-singapore"],
    capabilities: { noSql: false },
  },
};

export const SITE_IDS = Object.keys(SITE_REGION_MAP) as SiteId[];

/** Regions accepted by envQuery(list) / cross-region DescribeEnvs probes. */
export const TCB_QUERY_REGIONS = [
  "ap-shanghai",
  "ap-guangzhou",
  "ap-singapore",
] as const;

export type TcbQueryRegion = (typeof TCB_QUERY_REGIONS)[number];

export function isSiteId(value: unknown): value is SiteId {
  return value === "domestic" || value === "intl";
}

export function normalizeSite(value: unknown): SiteId | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "intl" || normalized === "international") {
    return "intl";
  }
  if (normalized === "domestic" || normalized === "cn") {
    return "domestic";
  }
  return undefined;
}

/**
 * 根据 region 与显式 site 解析站点。
 *
 * - 显式 site 优先（`domestic`/`intl`，兼容 `cn`/`international` 别名）
 * - 否则查 SITE_REGION_MAP：region 只属于一个站点时返回该站点
 * - 当 region 同时存在于多个站点（如 ap-singapore）时返回 `ambiguous`，由上层决定
 * - 未知 region 或未提供 region 时回退 domestic（全局默认）
 */
export function getSite(region: string | undefined, explicitSite?: string): SiteId | "ambiguous" {
  const explicit = normalizeSite(explicitSite);
  if (explicit) {
    return explicit;
  }
  if (!region) {
    return "domestic";
  }
  const matches = SITE_IDS.filter((site) => SITE_REGION_MAP[site].regions.includes(region));
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    return "ambiguous";
  }
  return "domestic";
}

/**
 * API Key 换取网关（POST /capi/credential 的 host）地域选型。
 *
 * 2026-09-01 同一把国内站 key 三地域网关实测：
 * - ap-shanghai / ap-guangzhou host 均换取成功（国内站集群共享 key 注册表，
 *   URL 中的 region 段在国内站内部等价，互换可用）
 * - ap-singapore host 拒绝（SIGN_PARAM_INVALID：sg 网关为国际站独立部署，
 *   key 注册表与国内站隔离）
 *
 * 因此换取 host 按**站点**选择，而非按环境所属地域：
 * - 显式 intl 站点（如 TCB_SITE=intl）→ 返回 intl 地域（ap-singapore）
 * - domestic / 歧义（如仅设 TCB_REGION=ap-singapore）/ 未配置 → 返回 undefined，
 *   toolbox 回落默认 ap-shanghai；国内站多地域环境（ap-guangzhou / ap-singapore）
 *   经默认域名均可换取，盲目传环境地域反而会把国内站 key 打到 sg 网关导致换取失败
 */
export function resolveApiKeyExchangeRegion(opts: { site?: string; region?: string } = {}): string | undefined {
  const resolved = resolveSiteAndRegion(opts);
  return resolved.site === "intl" && !resolved.ambiguous ? resolved.region : undefined;
}

export function resolveSite(region: string | undefined, explicitSite?: string): SiteId {
  const site = getSite(region, explicitSite);
  return site === "ambiguous" ? "intl" : site;
}

export interface ProjectConfig {
  site?: string;
  region?: string;
  envId?: string;
}

/**
 * 统一 site/region 解析入口（收敛各调用点分散的 region fallback）。
 *
 * 优先级：显式参数 > 环境变量（TCB_SITE/TCB_REGION）> 项目配置（.cloudbase/project.json）> 全局默认
 * （site=domestic, region=ap-shanghai）。
 *
 * 当仅指定 region 且该 region 在多个 site 的地域列表中都存在（如 ap-singapore）时，
 * 返回 site=intl 并标记 ambiguous=true（兼容既有国际站行为），调用方可用 ambiguous 提示用户显式指定 site。
 */
export function resolveSiteAndRegion(opts: { site?: string; region?: string } = {}): SiteResolution {
  const projectConfig = readProjectConfig();

  const explicitSite =
    normalizeSite(opts.site) ??
    normalizeSite(process.env.TCB_SITE) ??
    normalizeSite(projectConfig?.site);

  const explicitRegion = opts.region ?? process.env.TCB_REGION ?? projectConfig?.region;

  let site = explicitSite;
  let ambiguous = false;
  if (!site && explicitRegion) {
    const inferred = getSite(explicitRegion);
    if (inferred === "ambiguous") {
      site = "intl";
      ambiguous = true;
    } else if (inferred !== "domestic") {
      site = inferred;
    }
  }

  const resolvedSite: SiteId = site ?? "domestic";
  const region = explicitRegion ?? SITE_REGION_MAP[resolvedSite].defaultRegion;

  return {
    site: resolvedSite,
    region,
    ...(ambiguous ? { ambiguous: true } : {}),
  };
}

