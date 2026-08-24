import { readProjectConfig } from "./project-config.js";

export type SiteId = "domestic" | "intl";

export interface SiteDefinition {
  id: SiteId;
  label: string;
  authHost: string;
  consoleHost: string;
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
    defaultRegion: "ap-shanghai",
    regions: ["ap-shanghai", "ap-guangzhou", "ap-singapore"],
    capabilities: { noSql: true },
  },
  intl: {
    id: "intl",
    label: "国际站",
    authHost: "tcb.tencentcloud.com",
    consoleHost: "tcb.tencentcloud.com",
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
 * 认证/路由场景下解析站点：歧义（如 ap-singapore 未配 site）时默认 intl，保持既有国际站行为。
 */
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

