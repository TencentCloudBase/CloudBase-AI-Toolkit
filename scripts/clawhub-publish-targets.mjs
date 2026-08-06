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

export const CLAWHUB_PUBLISH_TARGETS = {
  "miniprogram-development": {
    key: "miniprogram-development",
    type: "local-skill",
    registrySlug: "miniprogram-development",
    displayName: "腾讯云 CloudBase 微信小程序开发 / Tencent CloudBase WeChat Mini Program Development",
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
    displayName: "腾讯云 CloudBase 微信生态集成 / Tencent CloudBase WeChat Integration",
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
    displayName: "腾讯云 CloudBase / Tencent CloudBase",
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
    displayName: "腾讯云 CloudBase UI 设计 / Tencent CloudBase UI Design",
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
    displayName: "腾讯云 CloudBase Web 开发 / Tencent CloudBase Web Development",
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
    displayName: "腾讯云 CloudBase Spec 流程 / Tencent CloudBase Spec Workflow",
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
  "minimal-web-baas-demo": {
    key: "minimal-web-baas-demo",
    type: "local-skill",
    registrySlug: "minimal-web-baas-demo",
    displayName: "腾讯云 CloudBase 最小 Web BaaS Demo / Tencent CloudBase Minimal Web BaaS Demo",
    summary:
      "腾讯云 CloudBase 最小 Web + 数据库 Demo 快路径：浏览器 @cloudbase/js-sdk CRUD、MCP 建表/建集合、默认 0 云函数，面向 WorkBuddy / Lovable 式分钟级预览。",
    iconUrl: CLOUDBASE_ICON_URL,
    sourceDir: path.join(
      projectRoot,
      "config",
      "source",
      "skills",
      "minimal-web-baas-demo",
    ),
    sourceDescription: "config/source/skills/minimal-web-baas-demo",
  },
};

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
