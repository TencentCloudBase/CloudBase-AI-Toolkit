import * as React from "react";
import type { Locale } from "../i18n/messages.js";
import { createTranslator, detectLocale } from "../i18n/index.js";
import type { PlatformProvider } from "../core/provider.js";
import { EFeatureId } from "../core/features.js";
import type { EnvFeatureContext } from "../core/types.js";
import { isFeatureAvailable } from "../core/features.js";

export enum EMenuType {
  ITEM = "ITEM",
  DIVIDER = "DIVIDER",
  GROUP = "GROUP",
}

export type MenuRouteId =
  | "overview"
  | "database"
  | "storage"
  | "functions"
  | "cloudrun"
  | "hosting"
  | "auth"
  | "gateway"
  | "logs"
  | "settings";

export interface MenuItem {
  type: EMenuType;
  id?: MenuRouteId;
  label?: string;
  groupLabel?: string;
  visible: boolean;
  restricted: boolean;
  selected: boolean;
  icon?: React.ReactNode;
  iconActive?: React.ReactNode;
}

export interface UseMenuOptions {
  locale: Locale;
  route: MenuRouteId;
  featureCtx: EnvFeatureContext;
  icons?: Partial<Record<MenuRouteId, { idle: React.ReactNode; active: React.ReactNode }>>;
}

const ROUTES: Array<{
  id: MenuRouteId;
  labelKey: Parameters<ReturnType<typeof createTranslator>>[0];
  requires?: EFeatureId;
  hideWhen?: EFeatureId;
}> = [
  { id: "overview", labelKey: "menu.overview" },
  { id: "database", labelKey: "menu.database" },
  { id: "storage", labelKey: "menu.storage" },
  { id: "functions", labelKey: "menu.functions" },
  { id: "cloudrun", labelKey: "menu.cloudrun" },
  { id: "hosting", labelKey: "menu.hosting" },
  { id: "auth", labelKey: "menu.auth" },
  { id: "gateway", labelKey: "menu.gateway" },
  { id: "logs", labelKey: "menu.logs" },
  { id: "settings", labelKey: "menu.settings" },
];

export function useMenu(options: UseMenuOptions): MenuItem[] {
  const tr = React.useMemo(() => createTranslator(options.locale), [options.locale]);
  return React.useMemo(() => {
    const ctx = options.featureCtx;
    return ROUTES.map((route) => {
      const restricted =
        (route.requires !== undefined && !isFeatureAvailable(route.requires, ctx)) ||
        (route.hideWhen !== undefined && !isFeatureAvailable(route.hideWhen, ctx));
      const icons = options.icons?.[route.id];
      return {
        type: EMenuType.ITEM,
        id: route.id,
        label: tr(route.labelKey),
        visible: !restricted || route.id === "database",
        restricted,
        selected: options.route === route.id,
        icon: icons?.idle,
        iconActive: icons?.active,
      } satisfies MenuItem;
    }).filter((item) => item.visible);
  }, [options.featureCtx, options.icons, options.locale, options.route, tr]);
}

export interface KitContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  provider?: PlatformProvider;
  featureCtx: EnvFeatureContext;
  tr: ReturnType<typeof createTranslator>;
}

const KitContext = React.createContext<KitContextValue | undefined>(undefined);

export interface KitProviderProps {
  locale?: Locale;
  provider?: PlatformProvider;
  featureCtx?: EnvFeatureContext;
  children: React.ReactNode;
}

export function KitProvider(props: KitProviderProps): React.ReactElement {
  const [locale, setLocaleState] = React.useState<Locale>(() => props.locale ?? detectLocale());

  React.useEffect(() => {
    if (props.locale) setLocaleState(props.locale);
  }, [props.locale]);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const tr = React.useMemo(() => createTranslator(locale), [locale]);
  const value = React.useMemo(
    (): KitContextValue => ({
      locale,
      setLocale,
      provider: props.provider,
      featureCtx: props.featureCtx ?? {},
      tr,
    }),
    [locale, setLocale, props.featureCtx, props.provider, tr],
  );
  return React.createElement(KitContext.Provider, { value }, props.children);
}

export function useKit(): KitContextValue {
  const ctx = React.useContext(KitContext);
  if (!ctx) {
    const locale = detectLocale();
    return {
      locale,
      setLocale: () => undefined,
      featureCtx: {},
      tr: createTranslator(locale),
    };
  }
  return ctx;
}
