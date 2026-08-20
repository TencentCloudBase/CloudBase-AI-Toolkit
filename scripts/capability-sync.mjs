#!/usr/bin/env node
/**
 * platform-kit 能力对齐巡检脚本（capability-sync）
 * -------------------------------------------------
 * 目标：让 platform-kit 随 dev-platform（生产控制台）与 MCP 工具能力持续对齐，
 *      从"推一步走一步"变成"定期巡检 → 自动暴露缺口 → 派任务补齐"。
 *
 * 三个输入源：
 *   1. dev-platform 功能目录树   —— 生产控制台有什么功能（事实标准）
 *   2. MCP 服务器工具/action 清单 —— 平台能力边界（数据层能做什么）
 *   3. platform-kit 已实现组件    —— 我们做到哪一步
 *
 * 输出：
 *   docs/platform-kit-alignment.md —— 对齐矩阵（每次巡检全量重写）
 *
 * 用法：
 *   node scripts/capability-sync.mjs            # 全量巡检，输出对齐矩阵
 *   node scripts/capability-sync.mjs --diff     # 对比上次基线，只输出新增/变更
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));
const DEV_PLATFORM = process.env.DEV_PLATFORM || join(homedir(), "Projects/cloudbase/weda-alternative/apps/dev-platform");
const KIT = process.env.KIT || join(ROOT, "platform-kit");
const MCP_DIST = process.env.MCP_DIST || join(homedir(), "cloudbase-mcp/node_modules/@cloudbase/cloudbase-mcp/dist/index.cjs");
const OUT = join(ROOT, "docs/platform-kit-alignment.md");
const BASELINE = join(ROOT, "docs/.alignment-baseline.json");

/** 10 菜单域 → dev-platform 对应子页前缀 + 文件是否存在的检查路径 */
const DOMAINS = [
  { id: "overview", kit: "OverviewPage", dp: ["overview"], desc: "概览（用量/告警/访问入口/部署时间轴）" },
  { id: "database", kit: "DatabasePage", dp: ["db/postgres", "db/mysql", "db/sql-editor"], desc: "数据库（PG schema/RLS/SQL/角色/迁移/备份）" },
  { id: "storage", kit: "StoragePage", dp: ["tcb/storage"], desc: "存储（bucket/文件/安全规则/CDN）" },
  { id: "auth", kit: "AuthUsersPage", dp: ["identity"], desc: "认证（用户列表/登录方式/MFA）" },
  { id: "functions", kit: "FunctionsPage", dp: ["tcb/scf"], desc: "云函数（列表/详情/触发器/日志）" },
  { id: "cloudrun", kit: "CloudRunPage", dp: ["platform-run/tcb-service"], desc: "云托管（服务/版本/部署）" },
  { id: "hosting", kit: "HostingPage", dp: ["static-hosting"], desc: "静态托管（域名/文件/部署）" },
  { id: "gateway", kit: "GatewayPage", dp: ["env/http-access", "env/domain", "env/safety-source"], desc: "网关（HTTP 开关/域名/路由/安全来源）" },
  { id: "logs", kit: "LogsPage", dp: ["platform-run/tcb-log"], desc: "日志（CLS 查询/函数日志）" },
  { id: "settings", kit: "SettingsPage", dp: ["env/env-setting", "env/qps-limit", "env/customize-cdn"], desc: "设置（环境配置/QPS/CDN）" },
];

/** UI 操作元素（功能深度 = 交互面大小，dev-platform 很多功能是 UI 层做的） */
const UI_PATTERNS = [
  "Button", "Modal", "Drawer", "Tabs", "TabPane", "Popconfirm", "Dropdown",
  "Select", "Switch", "Form", "Input", "Table", "Menu", "Breadcrumb",
  "Tag", "Badge", "Progress", "Tooltip", "Descriptions", "Steps", "Timeline",
];

function scanDevPlatform() {
  const pages = join(DEV_PLATFORM, "src/pages");
  if (!existsSync(pages)) return [];
  const out = execSync(`find ${pages} -maxdepth 1 -type d`, { encoding: "utf8" });
  return out.split("\n").filter(Boolean)
    .map((p) => p.replace(pages + "/", ""))
    .filter(Boolean);
}

/** 抓 MCP 工具清单（registerTool?.("xxx")） */
function scanMcpTools() {
  if (!existsSync(MCP_DIST)) return [];
  const src = readFileSync(MCP_DIST, "utf8");
  const re = /registerTool\??\.?\("([a-zA-Z]+)"/g;
  const set = new Set();
  let m;
  while ((m = re.exec(src))) set.add(m[1]);
  return [...set].sort();
}

/** 抓 MCP 中存储等 action 枚举 */
function scanMcpActions() {
  if (!existsSync(MCP_DIST)) return {};
  const src = readFileSync(MCP_DIST, "utf8");
  const out = {};
  const re = /const (STORAGE_ACTIONS|GATEWAY_ACTIONS|PG_ACTIONS|AUTH_ACTIONS)\s*=\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(src))) {
    const items = m[2].match(/"([a-zA-Z]+)"/g);
    out[m[1]] = items ? items.map((s) => s.replace(/"/g, "")) : [];
  }
  return out;
}

/** 抓 platform-kit 已实现页面组件 */
function scanKitPages() {
  if (!existsSync(join(KIT, "src"))) return [];
  const out = execSync(`find ${KIT}/src/components -name "*.tsx" | sort`, { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((p) => p.split("/").pop().replace(".tsx", "")).sort();
}

/** dev-platform 子页文件数量（判断该域是否真有内容，递归计数） */
function dpDirDepth(prefix) {
  if (!existsSync(DEV_PLATFORM)) return 0;
  const dir = `${DEV_PLATFORM}/src/pages/${prefix}`;
  if (!existsSync(dir)) return 0;
  const out = execSync(`find ${dir} -name "*.tsx" -o -name "*.ts" | wc -l`, { encoding: "utf8" });
  return parseInt(out.trim() || "0", 10);
}

/** dev-platform 某域的 UI 操作数（功能深度）——统计 UI 组件出现次数 */
function dpUiOps(prefix) {
  if (!existsSync(DEV_PLATFORM)) return 0;
  const dir = `${DEV_PLATFORM}/src/pages/${prefix}`;
  if (!existsSync(dir)) return 0;
  const files = execSync(`find ${dir} -name "*.tsx" 2>/dev/null`, { encoding: "utf8" })
    .split("\n").filter(Boolean);
  let count = 0;
  for (const f of files) {
    try {
      const src = readFileSync(f, "utf8");
      for (const p of UI_PATTERNS) {
        const re = new RegExp(`<${p}[\\s>]`, "g");
        count += (src.match(re) || []).length;
      }
    } catch { /* ignore */ }
  }
  return count;
}

/** dev-platform 某域的数据调用数（接口层）——统计 model/request 请求函数出现 */
function dpApiCalls(prefix) {
  if (!existsSync(DEV_PLATFORM)) return 0;
  const dir = `${DEV_PLATFORM}/src/pages/${prefix}`;
  if (!existsSync(dir)) return 0;
  const files = execSync(`find ${dir} -name "*.ts" -o -name "*.tsx" 2>/dev/null`, { encoding: "utf8" })
    .split("\n").filter(Boolean);
  let count = 0;
  for (const f of files) {
    try {
      const src = readFileSync(f, "utf8");
      // 请求函数模式：xxxService.xxx() / getStorageGatewayRequest / callXxx / .post/.get/.put/.delete(
      count += (src.match(/[a-zA-Z]*Service\.[a-zA-Z]+\(/g) || []).length;
      count += (src.match(/getStorageGatewayRequest\(/g) || []).length;
      count += (src.match(/\b(request|api)\.[a-zA-Z]+\(/g) || []).length;
      count += (src.match(/\.(post|get|put|delete)\("\/api\//g) || []).length;
    } catch { /* ignore */ }
  }
  return count;
}

/** MCP manager SDK 方法调用（藏得深的数据能力）——manager.<domain> 域集合 + 直接属性方法 */
function scanMcpSdkCalls() {
  if (!existsSync(MCP_DIST)) return {};
  const src = readFileSync(MCP_DIST, "utf8");
  const out = {};
  // 函数式调用：manager.commonService("tcb", ...).call(...) / manager.database(...)
  const re = /manager\.([a-zA-Z]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const key = m[1];
    if (key === "ts" || key === "") continue;
    out[key] = out[key] || new Set();
  }
  // 属性式调用：manager.env.getEnvInfo / manager.database.executePGSql
  const re2 = /manager\.([a-zA-Z]+)\.([a-zA-Z]+)/g;
  while ((m = re2.exec(src))) {
    out[m[1]] = out[m[1]] || new Set();
    out[m[1]].add(m[2]);
  }
  const res = {};
  for (const [k, v] of Object.entries(out)) res[k] = [...v].sort();
  return res;
}

function main() {
  const devPages = scanDevPlatform();
  const mcpTools = scanMcpTools();
  const mcpActions = scanMcpActions();
  const mcpSdk = scanMcpSdkCalls();
  const kitPages = scanKitPages();

  // 功能域对齐行（功能深度指数）
  const domainRows = DOMAINS.map((d) => {
    const kitExists = kitPages.includes(d.kit);
    const dpExists = d.dp.some((p) => devPages.includes(p));
    const dpFiles = d.dp.reduce((s, p) => s + dpDirDepth(p), 0);
    const uiOps = d.dp.reduce((s, p) => s + dpUiOps(p), 0);
    const apiCalls = d.dp.reduce((s, p) => s + dpApiCalls(p), 0);
    const dpDepth = uiOps > 0 ? `${uiOps} UI / ${apiCalls} API / ${dpFiles} 文件` : `${dpFiles} 文件`;
    let state;
    if (kitExists && dpExists && uiOps === 0) state = "✅ 已实现（dev-platform 无 UI 面待查）";
    else if (kitExists && dpExists) state = "⚠️ 部分（功能深度待对齐）";
    else if (!kitExists) state = "❌ 缺失";
    else state = "⚠️ 部分";
    return `| ${d.id} | ${d.kit} | ${state} | ${d.desc} | ${dpDepth} |`;
  });

  const md = `# platform-kit 能力对齐矩阵

> 由 \`scripts/capability-sync.mjs\` 自动生成 · 上次巡检：${new Date().toISOString().slice(0, 16)}
>
> **维护约定**：dev-platform 或 cloudbase-mcp 迭代后重跑本脚本（\`node scripts/capability-sync.mjs\`），把新增的 ❌/⚠️ 缺口派发为 ATO 任务。不要手改本文件（要改改脚本）。
>
> **重要说明**：本矩阵只提供**功能深度线索**（UI 操作数 + API 调用数），不代表对齐结论。真正的功能点对齐必须由执行 agent **深读 dev-platform 源码**逐页列出功能点（按钮/表单/弹窗/交互流），再对照 kit 实现。脚本不能替代源码阅读。

## 1. 十菜单功能域对齐（含功能深度指数）

| 菜单域 | kit 页面 | 状态 | 功能范围 | dev-platform 功能深度 |
|---|---|---|---|---|
${domainRows.join("\n")}

> **功能深度解读**：dev-platform 大量功能是 UI/交互层实现的（如 bucket 表单校验、RLS 策略编辑器、上传进度、空态引导），接口层并未增加。UI 操作数反映"这个页面有多少交互功能面"，API 调用数反映"数据层有多少请求点"。两者都要对齐。

## 2. MCP 工具清单（能力边界 · 已注册 ${mcpTools.length} 个）

\`\`\`
${mcpTools.join(" ")}
\`\`\`

> capi-only 铁律：kit 内不得调用上述专用工具，一律走 \`callCloudApi(service, action, params)\`。

## 3. MCP manager SDK 方法调用（藏得深的真实能力）

${Object.keys(mcpSdk).length
    ? Object.entries(mcpSdk).map(([k, v]) => `- **manager.${k}**: \`${v.join("`, `")}\``).join("\n")
    : "(未提取到)"}

> 工具名只是门面，manager SDK 方法才是数据引擎。对齐时以本表为准，不要只盯着 registerTool 清单。

## 4. MCP action 枚举（数据层能力）

${Object.keys(mcpActions).length
    ? Object.entries(mcpActions).map(([k, v]) => `- **${k}**: \`${v.join("`, `")}\``).join("\n")
    : "(未提取到)"}

## 5. platform-kit 已实现组件（${kitPages.length} 个）

${kitPages.length ? kitPages.map((p) => `- \`${p}\``).join("\n") : "(空)"}

## 6. 缺口线索（巡检结论 · 需 agent 深读源码确认）

${domainRows.filter((r) => r.includes("❌") || r.includes("⚠️")).map((r) => `- ${r}`).join("\n") || "无"}

---
*生成命令：\`node scripts/capability-sync.mjs\`*
`;

  writeFileSync(OUT, md);
  console.log(`✅ 对齐矩阵已生成: ${OUT}`);
  console.log(`   10 域: ${domainRows.filter((r) => r.includes("✅")).length} 已实现 / ${domainRows.filter((r) => r.includes("⚠️")).length} 部分 / ${domainRows.filter((r) => r.includes("❌")).length} 缺失`);
  console.log(`   MCP 工具: ${mcpTools.length} | manager SDK 域: ${Object.keys(mcpSdk).length} | kit 组件: ${kitPages.length}`);

  if (process.argv.includes("--diff")) {
    console.log("\n=== 缺口线索（❌/⚠️）===");
    domainRows.filter((r) => r.includes("❌") || r.includes("⚠️")).forEach((r) => console.log(r));
  }
}

main();
