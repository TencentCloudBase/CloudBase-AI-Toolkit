import { readProjectConfig } from "../utils/project-config.js";
import { zh, type MessageKey, type Messages } from "./locales/zh.js";
import { en } from "./locales/en.js";

/**
 * MCP 输出语言。解析链（与 spec specs/intl-site-enhancement 对齐）：
 *
 *   调用级 lang 参数（工具入参，作为 t() 的 langOverride） > 实例 lang（createCloudBaseMcpServer options.lang，
 *   server 启动时 setInstanceLang） > TCB_LANG 环境变量 > .cloudbase/project.json lang > 默认 zh
 */
export type Lang = "zh" | "en";

export type { MessageKey, Messages };

/** 宽容解析语言别名（en / EN / en-US / zh-CN / cn…），未知值返回 undefined */
export function normalizeLang(value: unknown): Lang | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[-_]/g, "");
  if (normalized === "en" || normalized.startsWith("enus")) {
    return "en";
  }
  if (normalized === "zh" || normalized.startsWith("zhcn") || normalized === "cn") {
    return "zh";
  }
  return undefined;
}

let instanceLang: Lang | undefined;

/** server 创建时注入实例语言（createCloudBaseMcpServer options.lang 解析链的落点） */
export function setInstanceLang(lang: Lang): void {
  instanceLang = lang;
}

export function getInstanceLang(): Lang {
  return instanceLang ?? resolveInstanceLang();
}

/**
 * 无显式实例语言时的解析链：显式参数 > TCB_LANG env > project.json lang > 默认 zh。
 * （调用级 > 实例级由 t() 的 langOverride 参数承担，不在此处。）
 */
export function resolveInstanceLang(explicit?: unknown): Lang {
  const fromExplicit = normalizeLang(explicit);
  if (fromExplicit) {
    return fromExplicit;
  }
  const fromEnv = normalizeLang(process.env.TCB_LANG);
  if (fromEnv) {
    return fromEnv;
  }
  const fromProject = normalizeLang(readProjectConfig()?.lang);
  return fromProject ?? "zh";
}

function lookupDictionary(key: string): string | undefined {
  const dot = key.indexOf(".");
  if (dot <= 0 || dot === key.length - 1) {
    return undefined;
  }
  const namespace = key.slice(0, dot);
  const rest = key.slice(dot + 1);
  const zhModule = (zh as Record<string, Record<string, string>>)[namespace];
  if (zhModule && typeof zhModule[rest] === "string") {
    return zhModule[rest];
  }
  const enModule = (en as Record<string, Record<string, string>>)[namespace];
  if (enModule && typeof enModule[rest] === "string") {
    return enModule[rest];
  }
  return undefined;
}

/** 运行时判断一个字符串是否为词典 key（server registerTool 包装层用它识别词典 key 形式的 description） */
export function isMessageKey(key: unknown): key is MessageKey {
  return typeof key === "string" && lookupDictionary(key) !== undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * 按词典 key 取文案。语言选择：langOverride（调用级）> 实例 lang > 解析链默认。
 * key 缺失时回退原 key 字符串（编译期 MessageKey 类型已保证 key 存在，运行时兜底防动态拼接）。
 */
export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
  langOverride?: Lang,
): string {
  const keyStr = key as string;
  const lang = langOverride ?? getInstanceLang();
  const dot = keyStr.indexOf(".");
  const namespace = dot > 0 ? keyStr.slice(0, dot) : "";
  const rest = dot > 0 ? keyStr.slice(dot + 1) : "";
  const dict =
    lang === "en"
      ? (en as Record<string, Record<string, string>>)[namespace]
      : (zh as Record<string, Record<string, string>>)[namespace];
  const template = dict && typeof dict[rest] === "string" ? dict[rest] : lookupDictionary(key);
  return template ? interpolate(template, params) : key;
}
