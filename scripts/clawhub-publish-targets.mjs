#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const CLAWHUB_PUBLISH_TARGETS = {
  "miniprogram-development": {
    key: "miniprogram-development",
    type: "local-skill",
    registrySlug: "miniprogram-development",
    displayName: "微信小程序开发 / WeChat Mini Program Development",
    sourceDir: path.join(
      projectRoot,
      "config",
      "source",
      "skills",
      "miniprogram-development",
    ),
    sourceDescription: "config/source/skills/miniprogram-development",
  },
  "all-in-one": {
    key: "all-in-one",
    type: "generated-allinone",
    registrySlug: "cloudbase",
    displayName: "CloudBase 云开发 / CloudBase",
    sourceDescription: "generated via scripts/build-allinone-skill.ts",
  },
  "ui-design": {
    key: "ui-design",
    type: "local-skill",
    registrySlug: "ui-design-guide",
    publishName: "ui-design-guide",
    displayName: "UI 设计 / UI Design",
    sourceDir: path.join(projectRoot, "config", "source", "skills", "ui-design"),
    sourceDescription: "config/source/skills/ui-design",
  },
  "web-development": {
    key: "web-development",
    type: "local-skill",
    registrySlug: "web-development",
    displayName: "Web 开发 / Web Development",
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
    displayName: "Spec 流程 / Spec Workflow",
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
