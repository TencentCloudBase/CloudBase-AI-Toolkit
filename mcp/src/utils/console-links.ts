import { SITE_REGION_MAP, type SiteId } from "./site-map.js";

/**
 * 控制台与购买页的域名按站点切。依据是控制台前端自己的映射：
 *
 *   CONSOLE_DOMAIN: intl ? console.tencentcloud.com : console.cloud.tencent.com
 *   BUY_DOMAIN:     intl ? buy.tencentcloud.com     : buy.cloud.tencent.com
 *
 * 购买页只剩 CloudBase 一个入口：旧的 `/lowcode?buyType=tcb&channel=mcp` 已 302 到
 * `/CloudBase`，且重定向时把 query 全丢了（实测 `location: https://buy.cloud.tencent.com/CloudBase`），
 * 所以路径统一写 `/CloudBase`，区域用站点的默认地域。
 *
 * ⚠️ 国际站的 `/CloudBase` 路径与 `region` / `sqlType` 参数只按国内站同构推断，
 * 没有真实下单验证过；要改这里先开一次国际站购买页确认。
 */
const BUY_HOST: Record<SiteId, string> = {
  domestic: "buy.cloud.tencent.com",
  intl: "buy.tencentcloud.com",
};

const CONSOLE_HOST: Record<SiteId, string> = {
  domestic: "console.cloud.tencent.com",
  intl: "console.tencentcloud.com",
};

/** 开通/购买环境。region 取站点默认地域：国内 ap-shanghai、国际 ap-singapore。 */
export function resolveEnvPurchaseUrl(site: SiteId): string {
  const region = SITE_REGION_MAP[site].defaultRegion;
  return `https://${BUY_HOST[site]}/CloudBase?buyType=tcb&region=${region}&sqlType=pg`;
}

/** 控制台页面（环境列表 / 销毁入口）。`path` 默认是 CloudBase 环境页。 */
export function resolveEnvConsoleUrl(site: SiteId, path = "/tcb"): string {
  return `https://${CONSOLE_HOST[site]}${path}`;
}
