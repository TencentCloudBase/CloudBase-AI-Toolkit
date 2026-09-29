import { z } from "zod";
import type { ExtendedMcpServer } from "../server.js";
import { readRepeatPeak, readToolOutcomes, type ToolOutcome } from "../utils/feedback-session.js";
import { jsonContent } from "../utils/json-content.js";

/**
 * Public tool name is intentionally blank.
 * Feedback is not a CloudBase resource, so it does not join the query* / manage*
 * pair. registerFeedbackTools does nothing until this is set to a confirmed name.
 */
export const FEEDBACK_TOOL_NAME: string = "";

const CASE_TEMPLATE_FILE = "1-case-showcase.yml";
const RETROSPECTIVE_TEMPLATE_FILE = "2-dev-retrospective.yml";
const CASE_ISSUE_BASE_URL_ENV = "CLOUDBASE_FEEDBACK_CNB_NEW_ISSUE_URL";

const RESOURCE_BY_TOOL: Record<string, string> = {
  queryHosting: "静态托管",
  manageHosting: "静态托管",
  readNoSqlDatabaseStructure: "云数据库（文档型）",
  writeNoSqlDatabaseStructure: "云数据库（文档型）",
  readNoSqlDatabaseContent: "云数据库（文档型）",
  writeNoSqlDatabaseContent: "云数据库（文档型）",
  queryMysqlDatabase: "云数据库（MySQL）",
  manageMysqlDatabase: "云数据库（MySQL）",
  queryPgDatabase: "云数据库（PostgreSQL）",
  managePgDatabase: "云数据库（PostgreSQL）",
  queryFunctions: "云函数",
  manageFunctions: "云函数",
  queryStorage: "云存储",
  manageStorage: "云存储",
  queryPgStorage: "云存储",
  queryAppAuth: "身份认证",
  manageAppAuth: "身份认证",
  queryCloudRun: "CloudRun",
  manageCloudRun: "CloudRun",
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

type FeedbackServerContext = {
  ide?: string;
  client?: string;
  cloudBaseOptions?: {
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

function blank(value: string): string {
  return value.trim().length > 0 ? value.trim() : "留空";
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

function resourceTypesFrom(outcomes: readonly ToolOutcome[]): string[] {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.failed) {
      continue;
    }
    const resourceType = RESOURCE_BY_TOOL[outcome.toolName];
    if (!resourceType || seen.has(resourceType)) {
      continue;
    }
    seen.add(resourceType);
    types.push(resourceType);
  }
  return types;
}

function formatDeployDuration(outcomes: readonly ToolOutcome[]): string {
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
  return `${parts.join("；")}。无法区分云端构建与端到端，只记录上述工具耗时，未补另一项`;
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

function failureLines(server: object, outcomes: readonly ToolOutcome[]): string[] {
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
    lines.push(`- 可验证事实：工具调用失败 ${toolName} ×${count}`);
    if (count >= 2) {
      lines.push(`- 可验证事实：${toolName} 失败不少于 2 次`);
    }
  }
  if (hiddenFailures > 0) {
    lines.push(`- 可验证事实：另有 ${hiddenFailures} 次失败未列出工具名（名称不在已知工具表内）`);
  }
  const repeatPeak = readRepeatPeak(server);
  if (repeatPeak > 0) {
    lines.push(`- 可验证事实：连续相同结构化错误峰值 ${repeatPeak}`);
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

function buildCaseDraft(server: FeedbackServerContext, outcomes: readonly ToolOutcome[]): string {
  const resources = resourceTypesFrom(outcomes);
  const lines = [
    "作品名称：留空",
    "一句话简介：留空",
    "公网访问地址：留空",
    "封面 / 截图地址：留空",
    `Agent / CLI：${blank(readAgentLabel(server))}`,
    "所用模型：留空",
    `MCP 版本：${blank(resolveMcpVersion(readDeclaredMcpVersion(), process.env.npm_package_version))}`,
    `部署耗时：${blank(formatDeployDuration(outcomes))}`,
    `用到的云资源：${resources.length > 0 ? resources.join("、") : "留空"}`,
    `部署时间：${blank(latestDeployTime(outcomes))}`,
    "作者署名 / 主页：留空",
    "开发过程中踩到的坑：留空",
    "其他补充：留空",
  ];
  return lines.join("\n");
}

function buildRetrospectiveDraft(server: object, outcomes: readonly ToolOutcome[]): string {
  const resources = resourceTypesFrom(outcomes);
  const failures = failureLines(server, outcomes);
  const failureBlock = failures.length > 0
    ? failures.join("\n")
    : "留空（本次没有可列出的工具失败，也没有重复错误计数）";
  const resourceBlock = resources.length > 0
    ? `可验证事实：${resources.join("、")}`
    : "留空";
  return [
    "这份草稿可能包含业务信息。确认后若粘贴提交，会进入团队可见的内部通道，不会公开。",
    "请确认其中没有环境 ID、密钥、凭证，也没有集合名或函数名。云资源只保留类型。",
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

function caseIssueBaseUrl(override?: string): string {
  const value = override ?? process.env[CASE_ISSUE_BASE_URL_ENV] ?? "";
  return value.trim();
}

export function buildCasePrefillUrl(baseUrl: string, description: string): string {
  const base = baseUrl.trim().replace(/\?.*$/, "");
  const query = [
    `template=${encodeURIComponent(CASE_TEMPLATE_FILE)}`,
    `title=${encodeURIComponent("[案例] ")}`,
    `issue[description]=${encodeURIComponent(description)}`,
  ].join("&");
  return `${base}?${query}`;
}

export function buildFeedbackPayload(input: {
  server: FeedbackServerContext;
  channel: FeedbackChannel;
  confirmed: boolean;
  caseIssueBaseUrl?: string;
}): FeedbackPayload {
  const outcomes = readToolOutcomes(input.server);
  const secrets = collectSecretValues(input.server);
  const draft = redact(
    input.channel === "case"
      ? buildCaseDraft(input.server, outcomes)
      : buildRetrospectiveDraft(input.server, outcomes),
    secrets,
  );
  if (!input.confirmed) {
    return {
      success: true,
      channel: input.channel,
      confirmed: false,
      submittable: false,
      draft,
      nextStep: "把 draft 全文展示给用户。用户明确确认之前，不要给出提交链接，也不要要求粘贴提交。",
    };
  }
  if (input.channel === "retrospective") {
    return {
      success: true,
      channel: input.channel,
      confirmed: true,
      submittable: false,
      draft,
      nextStep:
        `用户已确认。请让用户复制 draft，粘贴到私有反馈仓的模板 ${RETROSPECTIVE_TEMPLATE_FILE}。不要代为提交。`,
    };
  }
  const baseUrl = caseIssueBaseUrl(input.caseIssueBaseUrl);
  if (!baseUrl) {
    return {
      success: true,
      channel: "case",
      confirmed: true,
      submittable: false,
      draft,
      nextStep: "用户已确认，但收集仓库地址未配置，因此没有可点击链接。不要编造地址，不要代为提交。",
    };
  }
  return {
    success: true,
    channel: "case",
    confirmed: true,
    submittable: true,
    draft,
    url: buildCasePrefillUrl(baseUrl, draft),
    nextStep: "用户已确认。可以把 url 交给用户自行打开。不要代为提交。",
  };
}

export function registerFeedbackTools(server: ExtendedMcpServer): void {
  if (!FEEDBACK_TOOL_NAME) {
    return;
  }

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
