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
 * Default locale detection: document lang → navigator → zh fallback.
 * Host can pass an explicit locale to KitProvider / ManagerShell to override.
 * No navigator (SSR/tests) falls back to zh.
 */
export function detectLocale(): Locale {
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang || document.documentElement.getAttribute("lang") || "";
    if (/^zh/i.test(htmlLang)) return "zh";
    if (/^en/i.test(htmlLang)) return "en";
  }
  if (typeof navigator !== "undefined" && /^zh/i.test(navigator.language)) return "zh";
  if (typeof navigator !== "undefined" && navigator.language) return "en";
  return "zh";
}
