#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Pure-black-background CloudBase logo hosted in the dedicated plugin repo
// (TencentCloudBase/cloudbase-plugin). Used as the SkillHub / ClawHub skill icon
// so the marketplace cards match the CloudBase plugin branding.
const CLOUDBASE_ICON_URL =
  "https://raw.githubusercontent.com/TencentCloudBase/cloudbase-plugin/main/assets/logo-dark.png";

// ClawHub 的检索面**只有 displayName**（summary / description 全文不参与检索），
// 所以名字必须写成「中文能力名 · English」，中文关键词一定要落在名字里。
// 品牌不占名字开头（owner 位承载），只在英文段与品牌条目上出现一次。
//
// topics 与 categories 见 docs.openclaw.ai/clawhub/publishing（Skill catalog
// metadata）：topics 上限 **5 个**，categories 上限 3 个。topics 不参与检索，
// 只作为类目下的筛选标签 —— 所以底座词在每条重复出现并不增加区分度，只留
// 品牌词与中文别名，其余名额留给能力词。
const CLOUDBASE_TOPICS = ["cloudbase", "腾讯云开发"];

/* ------------------------------------------------------------------ *
 * Catalog metadata guardrails
 *
 * Registry-side limits taken verbatim from the publishing docs. Without a
 * local check a too-long topic list only surfaces at publish time — after the
 * artifact has been built and uploaded — so validate at module load instead.
 * ------------------------------------------------------------------ */

export const MAX_TOPICS = 5;
export const MAX_TOPIC_LENGTH = 48;

// Reserved by ClawHub; rejected on the *normalized* form (`Official`, `staff
// pick` are rejected too). Kept in sync with the publishing docs.
export const RESERVED_TOPICS = Object.freeze([
  "approved",
  "audited",
  "certified",
  "clawhub",
  "community",
  "curated",
  "endorsed",
  "featured",
  "official",
  "officials",
  "openclaw",
  "recommended",
  "staff-pick",
  "trusted",
  "trusted-publisher",
  "verified",
]);

// ClawHub lowercases topics and renders spaces as hyphens (`Git Worktree` is
// displayed as `#git-worktree`), and applies the reserved-name check after that
// normalization.
export function normalizeTopic(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function validateTargets(targets = CLAWHUB_PUBLISH_TARGETS) {
  const reserved = new Set(RESERVED_TOPICS);
  const problems = [];

  for (const [key, target] of Object.entries(targets)) {
    const seen = new Set();

    for (const raw of target.topics ?? []) {
      const topic = normalizeTopic(raw);
      if (!topic) continue;

      if (seen.has(topic)) continue;
      seen.add(topic);

      if (topic.length > MAX_TOPIC_LENGTH) {
        problems.push(
          `${key}: topic "${topic}" 长度 ${topic.length} 超过上限 ${MAX_TOPIC_LENGTH}`,
        );
      }
      if (reserved.has(topic)) {
        problems.push(`${key}: topic "${topic}" 是 ClawHub 保留词，发布会失败`);
      }
    }

    const count = seen.size;
    if (count > MAX_TOPICS) {
      problems.push(`${key}: ${count} 个 topics 超过上限 ${MAX_TOPICS}（去重后计数）`);
    }
  }

  return problems;
}

function assertTargetsAreValid(targets) {
  const problems = validateTargets(targets);
  if (problems.length === 0) return;

  throw new Error(
    `ClawHub 发布目标元数据不合法 / invalid ClawHub publish target metadata:\n` +
      problems.map((problem) => `  - ${problem}`).join("\n") +
      `\n规则见 https://docs.openclaw.ai/clawhub/publishing（Skill catalog metadata）`,
  );
}

export const CLAWHUB_PUBLISH_TARGETS = {
  // 每个条目可选带 `owner` 字段指定发布主体（组织 handle）。
  // 不填则沿用 CLI 当前登录主体；`registrySlug` 决定已发布条目的 slug，
  // 因此换主体不会改变 slug，条目的持续更新仍然落在同一个 slug 上。
  // 示例：owner: "example-org",
  //
  // `displayName` 会作为 `--name` 传给 clawhub（线上展示名 + 检索面）；
  // `topics` 会作为 `--topics`（逗号分隔）传过去，上限 5 个。
  "miniprogram-development": {
    key: "miniprogram-development",
    type: "local-skill",
    registrySlug: "miniprogram-development",
    displayName: "微信小程序开发 · WeChat Mini Program Development",
    topics: [...CLOUDBASE_TOPICS, "微信小程序", "miniprogram", "wx.cloud"],
    summary:
      "面向 AI 编码场景的腾讯云 CloudBase 微信小程序开发指南，覆盖项目脚手架、tabBar、路由、调试、预览、发布与 wx.cloud 集成。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDir: path.join(
      projectRoot,
      "config",
      "source",
      "skills",
      "miniprogram-development",
    ),
    sourceDescription: "config/source/skills/miniprogram-development",
  },
  "cloudbase-wechat-integration": {
    key: "cloudbase-wechat-integration",
    type: "local-skill",
    registrySlug: "cloudbase-wechat-integration",
    displayName: "微信生态集成 · WeChat Integration",
    topics: [...CLOUDBASE_TOPICS, "微信支付", "公众号", "wechat"],
    summary:
      "腾讯云 CloudBase 微信生态集成指南，覆盖小程序支付、公众号 JSAPI / Native 支付、公众号 OAuth、openid 处理与 Integration Center 云函数。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDir: path.join(
      projectRoot,
      "config",
      "source",
      "skills",
      "cloudbase-wechat-integration",
    ),
    sourceDescription: "config/source/skills/cloudbase-wechat-integration",
  },
  "all-in-one": {
    key: "all-in-one",
    type: "generated-allinone",
    registrySlug: "cloudbase",
    displayName: "腾讯云 CloudBase · Tencent CloudBase",
    topics: [...CLOUDBASE_TOPICS, "serverless", "baas", "后端一体化"],
    summary:
      "腾讯云 CloudBase 是面向 AI Coding 的后端一体化平台，内置数据库、存储、身份认证、云函数与云托管等服务，支持快速构建小程序、Web、移动 App、管理后台与 AI 应用。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDescription: "generated via scripts/build-allinone-skill.ts",
  },
  "ui-design": {
    key: "ui-design",
    type: "local-skill",
    registrySlug: "ui-design-guide",
    publishName: "ui-design-guide",
    displayName: "界面设计 · UI Design",
    topics: [...CLOUDBASE_TOPICS, "ui", "design", "设计规范"],
    summary:
      "腾讯云 CloudBase UI 设计指南，提供 Web 与小程序前端的高保真原型、视觉规范与组件设计规范。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDir: path.join(projectRoot, "config", "source", "skills", "ui-design"),
    sourceDescription: "config/source/skills/ui-design",
  },
  "web-development": {
    key: "web-development",
    type: "local-skill",
    registrySlug: "web-development",
    displayName: "Web 开发 · CloudBase Web Development",
    topics: [...CLOUDBASE_TOPICS, "web", "react", "vue"],
    summary:
      "腾讯云 CloudBase Web 前端开发指南，覆盖 React / Vue / Vite 工程化、静态托管部署、@cloudbase/js-sdk 集成与内置认证。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDir: path.join(
      projectRoot,
      "config",
      "source",
      "skills",
      "web-development",
    ),
    sourceDescription: "config/source/skills/web-development",
  },
  "spec-workflow": {
    key: "spec-workflow",
    type: "local-skill",
    registrySlug: "spec-workflow-guide",
    publishName: "spec-workflow-guide",
    displayName: "需求与设计流程 · Spec Workflow",
    topics: [...CLOUDBASE_TOPICS, "spec", "需求文档", "设计文档"],
    summary:
      "腾讯云 CloudBase 标准软件开发流程，统一需求 / 设计 / 任务文档与验收标准，适合中大型特性与多模块集成。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDir: path.join(
      projectRoot,
      "config",
      "source",
      "skills",
      "spec-workflow",
    ),
    sourceDescription: "config/source/skills/spec-workflow",
  },
};

// Fail fast on module load: every publish path imports this module, so an
// out-of-spec topic list breaks the run before anything is uploaded.
assertTargetsAreValid(CLAWHUB_PUBLISH_TARGETS);

export const DEFAULT_CLAWHUB_TARGET_KEYS = Object.freeze(
  Object.keys(CLAWHUB_PUBLISH_TARGETS),
);

export function parseTargetInput(rawTargets) {
  if (!rawTargets || !rawTargets.trim()) {
    throw new Error(
      `未提供发布目标 / No publish targets provided. 可用目标 / Allowed targets: ${DEFAULT_CLAWHUB_TARGET_KEYS.join(", ")}`,
    );
  }

  const normalized = rawTargets
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const unique = [];
  for (const target of normalized) {
    if (!unique.includes(target)) {
      unique.push(target);
    }
  }

  const invalidTargets = unique.filter(
    (target) => !CLAWHUB_PUBLISH_TARGETS[target],
  );

  if (invalidTargets.length > 0) {
    throw new Error(
      `存在无效发布目标 / Unknown publish targets: ${invalidTargets.join(", ")}。可用目标 / Allowed targets: ${DEFAULT_CLAWHUB_TARGET_KEYS.join(", ")}`,
    );
  }

  return unique;
}

export function resolvePublishTargets(rawTargets) {
  return parseTargetInput(rawTargets).map(
    (target) => CLAWHUB_PUBLISH_TARGETS[target],
  );
}
