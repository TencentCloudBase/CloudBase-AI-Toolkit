/**
 * Consumer smoke: proves published types are importable after `npm run build`.
 * Run via `npm run consumer-smoke`.
 */
import type { AuthStatus, PlatformProvider } from "@cloudbase/platform-kit";

type StylesModule = typeof import("@cloudbase/platform-kit/styles");

export function assertConsumerTypes(
  provider: PlatformProvider,
  styles: StylesModule,
): Promise<AuthStatus> {
  void styles.KIT_CSS;
  return provider.authStatus();
}
