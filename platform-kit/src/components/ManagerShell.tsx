import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import type { Locale } from "../i18n/messages.js";
import { detectLocale } from "../i18n/index.js";
import type { EnvFeatureContext } from "../core/types.js";
import {
  KitProvider,
  useMenu,
  type MenuRouteId,
} from "../hooks/use-menu.js";
import { SidebarNav } from "./SidebarNav.js";
import { OverviewPage } from "./OverviewPage.js";
import { LogsExplorerPage } from "./logs/LogsExplorerPage.js";
import { DatabasePage } from "./database/DatabasePage.js";
import { AuthUsersPage } from "./auth/AuthUsersPage.js";
import { GatewayPage } from "./gateway/GatewayPage.js";
import { FunctionsPage } from "./resources/FunctionsPage.js";
import { CloudRunPage } from "./resources/CloudRunPage.js";
import { HostingPage } from "./resources/HostingPage.js";
import { StoragePage } from "./resources/StoragePage.js";
import { SettingsPage } from "./settings/SettingsPage.js";
import { ensureKitStyles } from "../theme/styles.js";
import { resolvePostgresEnv } from "../core/features.js";

export interface ManagerShellProps {
  provider?: PlatformProvider;
  locale?: Locale;
  featureCtx?: EnvFeatureContext;
  route?: MenuRouteId;
  onRouteChange?: (route: MenuRouteId) => void;
  header?: React.ReactNode;
  renderRoute?: (route: MenuRouteId) => React.ReactNode;
  icons?: Parameters<typeof useMenu>[0]["icons"];
  onOpenPreview?: (url: string) => void;
}

function ManagerShellInner(props: ManagerShellProps): React.ReactElement {
  ensureKitStyles();
  const [route, setRoute] = React.useState<MenuRouteId>(props.route ?? "overview");
  const activeRoute = props.route ?? route;

  React.useEffect(() => {
    if (props.route) setRoute(props.route);
  }, [props.route]);

  const featureCtx = React.useMemo((): EnvFeatureContext => {
    const base = props.featureCtx ?? {};
    return {
      ...base,
      isPostgresEnv: base.isPostgresEnv ?? resolvePostgresEnv(base),
    };
  }, [props.featureCtx]);

  const menuItems = useMenu({
    locale: props.locale ?? detectLocale(),
    route: activeRoute,
    featureCtx,
    icons: props.icons,
  });

  const selectRoute = (id: MenuRouteId) => {
    setRoute(id);
    props.onRouteChange?.(id);
  };

  const defaultBody = (() => {
    switch (activeRoute) {
      case "overview":
        return (
          <OverviewPage
            provider={props.provider}
            onOpenEndpoint={props.onOpenPreview}
            onPreviewDeployment={props.onOpenPreview}
          />
        );
      case "database":
        return <DatabasePage provider={props.provider} />;
      case "auth":
        return <AuthUsersPage provider={props.provider} />;
      case "gateway":
        return <GatewayPage provider={props.provider} />;
      case "logs":
        return <LogsExplorerPage provider={props.provider} />;
      case "functions":
        return <FunctionsPage provider={props.provider} />;
      case "cloudrun":
        return <CloudRunPage provider={props.provider} />;
      case "hosting":
        return <HostingPage provider={props.provider} />;
      case "storage":
        return <StoragePage provider={props.provider} />;
      case "settings":
        return <SettingsPage provider={props.provider} />;
      default:
        return props.renderRoute?.(activeRoute) ?? (
          <div className="cb-kit-page">
            <div className="cb-kit-restricted">{activeRoute}</div>
          </div>
        );
    }
  })();

  return (
    <div className="cb-kit-root" data-testid="cb-kit-root">
      {props.header}
      <div className="cb-kit-shell">
        <SidebarNav items={menuItems} onSelect={selectRoute} />
        <main className="cb-kit-main" data-testid={`cb-kit-main-${activeRoute}`}>{defaultBody}</main>
      </div>
    </div>
  );
}

export function ManagerShell(props: ManagerShellProps): React.ReactElement {
  return (
    <KitProvider locale={props.locale} provider={props.provider} featureCtx={props.featureCtx}>
      <ManagerShellInner {...props} />
    </KitProvider>
  );
}
