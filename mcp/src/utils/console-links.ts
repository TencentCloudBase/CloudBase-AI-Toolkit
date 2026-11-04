/**
 * 控制台 / 购买页的固定链接。
 *
 * ⚠️ 别再写回 `/lowcode?buyType=tcb&channel=mcp`：那条路径现在 302 到 `/CloudBase`，
 * **重定向时把 query 全丢了**（实测 `location: https://buy.cloud.tencent.com/CloudBase`），
 * 用户会落到购买页首页、来源标记也一起丢。
 *
 * ⚠️ `region` / `sqlType` 是写死的：国内站默认 ap-shanghai + PG 版。国际站
 * （`buy.tencentcloud.com`）的域名与路径同构性未验证，见 `specs/site-domain-governance`。
 */
export const TCB_PURCHASE_URL =
  "https://buy.cloud.tencent.com/CloudBase?buyType=tcb&region=ap-shanghai&sqlType=pg";
