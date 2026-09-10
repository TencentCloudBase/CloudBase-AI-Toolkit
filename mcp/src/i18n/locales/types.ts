/**
 * i18n 词典模块契约。
 *
 * 每个 tools 模块对应一个词典文件（locales/modules/<module>.ts），
 * 通过 defineModule 声明 zh（真源）/ en（翻译）两棵同构 key 树。
 * en 的 key 完整性由泛型约束 `E extends Record<keyof Z, string>` 在编译期保证——漏译直接报错。
 *
 * key 解析：t("storage.description") → 模块名 = 首段，其余为模块内 key
 * （模块内 key 允许带点，如 "auth.status.notLoggedIn" → "auth" + "status.notLoggedIn"）。
 */
export interface ModuleMessages {
  [key: string]: string;
}

export interface ModuleDefinition<Z extends ModuleMessages = ModuleMessages, E extends ModuleMessages = ModuleMessages> {
  zh: Z;
  en: E;
}

export function defineModule<Z extends ModuleMessages, E extends Record<keyof Z, string>>(
  zh: Z,
  en: E,
): ModuleDefinition<Z, E> {
  return { zh, en };
}
