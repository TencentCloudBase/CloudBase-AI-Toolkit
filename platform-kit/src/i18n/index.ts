import type { Locale, MessageKey } from "./messages.js";
export type { Locale, MessageKey } from "./messages.js";
import { en } from "./en.js";
import { zh } from "./zh.js";

const CATALOG: Record<Locale, Record<MessageKey, string>> = { en, zh };

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = CATALOG[locale]?.[key] ?? CATALOG.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function createTranslator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
}

/**
 * 默认语言探测：读浏览器/系统语言，`zh*` → zh，其余 → en。
 * kit 内置，宿主无需注入；若宿主有明确语言设置，可显式传 locale 覆盖。
 * 无 navigator（SSR/测试）时回退 zh。
 */
export function detectLocale(): Locale {
  if (typeof navigator !== "undefined" && /^zh/i.test(navigator.language)) return "zh";
  return "en";
}
