import { z } from "zod";
import type { ExtendedMcpServer } from "../server.js";
import { readRepeatPeak, readToolOutcomes, type ToolOutcome } from "../utils/feedback-session.js";
import { jsonContent } from "../utils/json-content.js";
import { resolveSiteAndRegion, type SiteId } from "../utils/site-map.js";

/**
 * Not a CloudBase resource, so this does not use the query* / manage* pair.
 * The feedback plugin is in the default set and always registers this tool.
 */
export const FEEDBACK_TOOL_NAME = "prepareFeedback";

const CASE_TEMPLATE_FILE = "1-case-showcase.yml";
const RETROSPECTIVE_TEMPLATE_FILE = "2-dev-retrospective.yml";

/** Fixed new-issue pages. Intl uses GitHub. Domestic uses the CNB CloudBase-AI-ToolKit repo. */
export const FEEDBACK_ISSUE_NEW_URL: Record<SiteId, string> = {
  intl: "https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues/new",
  domestic: "https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-ToolKit/-/issues/new",
};

const RESOURCE_BY_TOOL: Record<string, { zh: string; en: string }> = {
  queryHosting: { zh: "静态托管", en: "Static hosting" },
  manageHosting: { zh: "静态托管", en: "Static hosting" },
  readNoSqlDatabaseStructure: { zh: "云数据库（文档型）", en: "Document database" },
  writeNoSqlDatabaseStructure: { zh: "云数据库（文档型）", en: "Document database" },
  readNoSqlDatabaseContent: { zh: "云数据库（文档型）", en: "Document database" },
  writeNoSqlDatabaseContent: { zh: "云数据库（文档型）", en: "Document database" },
  queryMysqlDatabase: { zh: "云数据库（MySQL）", en: "MySQL" },
  manageMysqlDatabase: { zh: "云数据库（MySQL）", en: "MySQL" },
  queryPgDatabase: { zh: "云数据库（PostgreSQL）", en: "PostgreSQL" },
  managePgDatabase: { zh: "云数据库（PostgreSQL）", en: "PostgreSQL" },
  queryFunctions: { zh: "云函数", en: "Cloud functions" },
  manageFunctions: { zh: "云函数", en: "Cloud functions" },
  queryStorage: { zh: "云存储", en: "Cloud storage" },
  manageStorage: { zh: "云存储", en: "Cloud storage" },
  queryPgStorage: { zh: "云存储", en: "Cloud storage" },
  queryAppAuth: { zh: "身份认证", en: "Auth" },
  manageAppAuth: { zh: "身份认证", en: "Auth" },
  queryCloudRun: { zh: "CloudRun", en: "CloudRun" },
  manageCloudRun: { zh: "CloudRun", en: "CloudRun" },
};

const REPORTABLE_TOOL_NAMES = new Set<string>([
  ...Object.keys(RESOURCE_BY_TOOL),
  "deployBuild",
  "deployPlan",
  "deployApply",
  "queryEnv",
  "auth",
  "searchKnowledgeBase",
  "downloadTemplate",
  "callCloudApi",
  "queryLogs",
  "manageLogs",
  "queryGateway",
  "manageGateway",
  "queryApps",
  "manageApps",
  "queryAgents",
  "manageAgents",
  "queryPermissions",
  "managePermissions",
]);

export type FeedbackChannel = "case" | "retrospective";

export type FeedbackPayload = {
  success: true;
  channel: FeedbackChannel;
  confirmed: boolean;
  submittable: boolean;
  draft: string;
  nextStep: string;
  url?: string;
};

type FeedbackLang = "zh" | "en";

type FeedbackServerContext = {
  ide?: string;
  client?: string;
  cloudBaseOptions?: {
    site?: string;
    region?: string;
    envId?: string;
    secretId?: string;
    secretKey?: string;
    token?: string;
  };
};

declare const __MCP_VERSION__: string;

export function resolveMcpVersion(
  declared: string | undefined,
  packageVersion: string | undefined,
): string {
  const fromBuild = typeof declared === "string" ? declared.trim() : "";
  if (fromBuild) {
    return fromBuild;
  }
  const fromPackage = typeof packageVersion === "string" ? packageVersion.trim() : "";
  return fromPackage;
}

function readDeclaredMcpVersion(): string | undefined {
  return typeof __MCP_VERSION__ !== "undefined" ? __MCP_VERSION__ : undefined;
}

function blank(value: string, lang: FeedbackLang): string {
  return value.trim().length > 0 ? value.trim() : (lang === "en" ? "blank" : "留空");
}

function feedbackSite(server: FeedbackServerContext): SiteId {
  return resolveSiteAndRegion({
    site: server.cloudBaseOptions?.site,
    region: server.cloudBaseOptions?.region,
  }).site;
}

function feedbackLang(site: SiteId): FeedbackLang {
  return site === "intl" ? "en" : "zh";
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  return ordered.join(" / ");
}

function readAgentLabel(server: FeedbackServerContext): string {
  const ide = server.ide || process.env.INTEGRATION_IDE || "";
  const client = server.client || process.env.CLOUDBASE_MCP_CLIENT || "";
  return uniqueJoin([ide, client]);
}

function toLocalIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

function resourceTypesFrom(outcomes: readonly ToolOutcome[], lang: FeedbackLang): string[] {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.failed) {
      continue;
    }
    const resourceType = RESOURCE_BY_TOOL[outcome.toolName]?.[lang];
    if (!resourceType || seen.has(resourceType)) {
      continue;
    }
    seen.add(resourceType);
    types.push(resourceType);
  }
  return types;
}

function formatDeployDuration(outcomes: readonly ToolOutcome[], lang: FeedbackLang): string {
  const build = outcomes.filter((item) => !item.failed && item.toolName === "deployBuild");
  const apply = outcomes.filter((item) => !item.failed && item.toolName === "deployApply");
  if (build.length === 0 && apply.length === 0) {
    return "";
  }
  const sum = (items: ToolOutcome[]) => items.reduce((total, item) => total + item.durationMs, 0);
  const parts: string[] = [];
  if (build.length > 0) {
    parts.push(`deployBuild ${sum(build)}ms`);
  }
  if (apply.length > 0) {
    parts.push(`deployApply ${sum(apply)}ms`);
  }
  const joined = parts.join(lang === "en" ? "; " : "；");
  return lang === "en"
    ? `${joined}. Cloud build time and end-to-end time cannot be separated from these tool names.`
    : `${joined}。无法区分云端构建与端到端，只记录上述工具耗时，未补另一项`;
}

function latestDeployTime(outcomes: readonly ToolOutcome[]): string {
  const deployOutcomes = outcomes.filter(
    (item) => !item.failed && (item.toolName === "deployBuild" || item.toolName === "deployApply"),
  );
  if (deployOutcomes.length === 0) {
    return "";
  }
  const latest = deployOutcomes.reduce((current, item) => (item.at > current.at ? item : current));
  return toLocalIso(latest.at);
}

function failureLines(server: object, outcomes: readonly ToolOutcome[], lang: FeedbackLang): string[] {
  const counts = new Map<string, number>();
  let hiddenFailures = 0;
  for (const outcome of outcomes) {
    if (!outcome.failed) {
      continue;
    }
    if (!REPORTABLE_TOOL_NAMES.has(outcome.toolName)) {
      hiddenFailures += 1;
      continue;
    }
    counts.set(outcome.toolName, (counts.get(outcome.toolName) ?? 0) + 1);
  }
  const lines: string[] = [];
  for (const [toolName, count] of counts) {
    lines.push(lang === "en"
      ? `- Verified: tool call failed ${toolName} ×${count}`
      : `- 可验证事实：工具调用失败 ${toolName} ×${count}`);
    if (count >= 2) {
      lines.push(lang === "en"
        ? `- Verified: ${toolName} failed at least twice`
        : `- 可验证事实：${toolName} 失败不少于 2 次`);
    }
  }
  if (hiddenFailures > 0) {
    lines.push(lang === "en"
      ? `- Verified: ${hiddenFailures} more failure(s) omitted because the tool name is not in the known list`
      : `- 可验证事实：另有 ${hiddenFailures} 次失败未列出工具名（名称不在已知工具表内）`);
  }
  const repeatPeak = readRepeatPeak(server);
  if (repeatPeak > 0) {
    lines.push(lang === "en"
      ? `- Verified: peak consecutive identical structured errors ${repeatPeak}`
      : `- 可验证事实：连续相同结构化错误峰值 ${repeatPeak}`);
  }
  return lines;
}

function collectSecretValues(server: FeedbackServerContext): string[] {
  const options = server.cloudBaseOptions;
  return [options?.envId, options?.secretId, options?.secretKey, options?.token].filter(
    (value): value is string => typeof value === "string" && value.trim().length >= 6,
  );
}

function redact(text: string, secrets: string[]): string {
  let redacted = text;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join("");
  }
  return redacted;
}

function buildCaseDraft(
  server: FeedbackServerContext,
  outcomes: readonly ToolOutcome[],
  lang: FeedbackLang,
): string {
  const resources = resourceTypesFrom(outcomes, lang);
  const empty = blank("", lang);
  const resourceText = resources.length > 0 ? resources.join(lang === "en" ? ", " : "、") : empty;
  const version = blank(resolveMcpVersion(readDeclaredMcpVersion(), process.env.npm_package_version), lang);
  if (lang === "en") {
    return [
      `Work name: ${empty}`,
      `One-line summary: ${empty}`,
      `Public URL: ${empty}`,
      `Cover / screenshot: ${empty}`,
      `Agent / CLI: ${blank(readAgentLabel(server), lang)}`,
      `Model: ${empty}`,
      `MCP version: ${version}`,
      `Deploy duration: ${blank(formatDeployDuration(outcomes, lang), lang)}`,
      `Cloud resources: ${resourceText}`,
      `Deploy time: ${blank(latestDeployTime(outcomes), lang)}`,
      `Author: ${empty}`,
      `Pitfalls: ${empty}`,
      `Other notes: ${empty}`,
    ].join("\n");
  }
  return [
    `作品名称：${empty}`,
    `一句话简介：${empty}`,
    `公网访问地址：${empty}`,
    `封面 / 截图地址：${empty}`,
    `Agent / CLI：${blank(readAgentLabel(server), lang)}`,
    `所用模型：${empty}`,
    `MCP 版本：${version}`,
    `部署耗时：${blank(formatDeployDuration(outcomes, lang), lang)}`,
    `用到的云资源：${resourceText}`,
    `部署时间：${blank(latestDeployTime(outcomes), lang)}`,
    `作者署名 / 主页：${empty}`,
    `开发过程中踩到的坑：${empty}`,
    `其他补充：${empty}`,
  ].join("\n");
}

function buildRetrospectiveDraft(
  server: object,
  outcomes: readonly ToolOutcome[],
  lang: FeedbackLang,
): string {
  const resources = resourceTypesFrom(outcomes, lang);
  const failures = failureLines(server, outcomes, lang);
  const empty = blank("", lang);
  if (lang === "en") {
    const failureBlock = failures.length > 0
      ? failures.join("\n")
      : "blank (no listed tool failures and no repeated-error count)";
    const resourceBlock = resources.length > 0
      ? `Verified: ${resources.join(", ")}`
      : empty;
    return [
      "Check that this draft has no environment ID, secrets, credentials, collection names, or function names. List cloud resources by type only.",
      "",
      "## 1. Conversation turns",
      "Total turns: blank (no conversation-turn signal; no estimated number)",
      "Phase split: blank (no verifiable phase signal)",
      "Extra turns from errors or misunderstandings: blank (tool failures are not conversation turns)",
      "Verified failure signals:",
      failureBlock,
      "",
      "## 2. Task completion",
      "blank (not filled from the conversation)",
      "",
      "## 3. Implementation overview",
      "blank (not filled from the conversation)",
      "",
      "## 4. Cloud resources",
      resourceBlock,
      "",
      "## 5. Problems and resolutions",
      "blank (not filled from the conversation)",
      "",
      "## 6. Improvements",
      "Tool: blank",
      "Problem type: blank",
      "Platform / MCP feedback: blank",
      "Code or architecture notes: blank",
      "",
      "## 7. Follow-up",
      "blank (this section is not finalized)",
    ].join("\n");
  }
  const failureBlock = failures.length > 0
    ? failures.join("\n")
    : "留空（本次没有可列出的工具失败，也没有重复错误计数）";
  const resourceBlock = resources.length > 0
    ? `可验证事实：${resources.join("、")}`
    : empty;
  return [
    "请确认草稿里没有环境 ID、密钥、凭证，也没有集合名或函数名。云资源只保留类型。",
    "",
    "## 1. 对话轮次统计",
    "总轮次：留空（没有对话轮次信号，不估算数字）",
    "阶段分布：留空（没有可验证的阶段信号）",
    "因错误或误解产生的额外轮次：留空（工具失败次数不是对话轮次）",
    "可验证的失败信号：",
    failureBlock,
    "",
    "## 2. 任务完成情况",
    "留空（不根据对话补写完成状态）",
    "",
    "## 3. 技术实现概览",
    "留空（不根据对话补写技术栈或文件）",
    "",
    "## 4. 云资源使用情况",
    resourceBlock,
    "",
    "## 5. 遇到的问题与解决方案",
    "留空（不根据对话补写问题与解法）",
    "",
    "## 6. 改进建议",
    "反馈主要涉及哪个工具：留空",
    "问题类型：留空",
    "对平台 / MCP 的具体反馈：留空",
    "代码或架构层面的优化建议：留空",
    "",
    "## 7. 后续工作",
    "留空（这一节的结构尚未定稿）",
  ].join("\n");
}

export function buildFeedbackIssueUrl(site: SiteId, channel: FeedbackChannel, draft: string): string {
  const title = site === "intl"
    ? (channel === "case" ? "[case] " : "[retrospective] ")
    : (channel === "case" ? "[案例] " : "[复盘] ");
  const base = FEEDBACK_ISSUE_NEW_URL[site];
  if (site === "intl") {
    return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(draft)}`;
  }
  const template = channel === "case" ? CASE_TEMPLATE_FILE : RETROSPECTIVE_TEMPLATE_FILE;
  const query = [
    `template=${encodeURIComponent(template)}`,
    `title=${encodeURIComponent(title)}`,
    `issue[description]=${encodeURIComponent(draft)}`,
  ].join("&");
  return `${base}?${query}`;
}

export function buildFeedbackPayload(input: {
  server: FeedbackServerContext;
  channel: FeedbackChannel;
  confirmed: boolean;
}): FeedbackPayload {
  const site = feedbackSite(input.server);
  const lang = feedbackLang(site);
  const outcomes = readToolOutcomes(input.server);
  const secrets = collectSecretValues(input.server);
  const draft = redact(
    input.channel === "case"
      ? buildCaseDraft(input.server, outcomes, lang)
      : buildRetrospectiveDraft(input.server, outcomes, lang),
    secrets,
  );
  if (!input.confirmed) {
    return {
      success: true,
      channel: input.channel,
      confirmed: false,
      submittable: false,
      draft,
      nextStep: lang === "en"
        ? "Show the full draft to the user. Do not give a submission link before they explicitly confirm."
        : "把 draft 全文展示给用户。用户明确确认之前，不要给出提交链接。",
    };
  }
  return {
    success: true,
    channel: input.channel,
    confirmed: true,
    submittable: true,
    draft,
    url: buildFeedbackIssueUrl(site, input.channel, draft),
    nextStep: lang === "en"
      ? "The user confirmed. Give them the url to open. Do not submit it for them."
      : "用户已确认。可以把 url 交给用户自行打开。不要代为提交。",
  };
}

export function registerFeedbackTools(server: ExtendedMcpServer): void {
  server.registerTool(
    FEEDBACK_TOOL_NAME,
    {
      title: "feedback.title",
      description: "feedback.description",
      inputSchema: {
        channel: z
          .enum(["case", "retrospective"])
          .describe("feedback.schema.channel"),
        confirmed: z
          .boolean()
          .optional()
          .describe("feedback.schema.confirmed"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        category: "feedback",
      },
    },
    async ({ channel, confirmed }) => {
      return jsonContent(buildFeedbackPayload({
        server,
        channel,
        confirmed: confirmed === true,
      }));
    },
  );
}
