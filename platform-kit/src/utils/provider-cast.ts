import type { PlatformProvider } from "../core/provider.js";

/** Narrow host data services (e.g. CloudBaseData) to PlatformProvider without `as never`. */
export function asPlatformProvider<T extends PlatformProvider>(data: T | undefined): PlatformProvider | undefined {
  return data;
}
