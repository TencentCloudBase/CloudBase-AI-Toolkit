declare module "@cloudbase/platform-kit" {
  import type * as React from "react";
  import type { AccessEndpoint, CloudBaseData } from "../shared/types.js";

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

  export interface ManagerShellProps {
    provider?: CloudBaseData;
    locale?: "zh" | "en";
    featureCtx?: { envId?: string; runtimeMode?: string; isPostgresEnv?: boolean };
    route?: MenuRouteId;
    onRouteChange?: (route: MenuRouteId) => void;
    header?: React.ReactNode;
    renderRoute?: (route: MenuRouteId) => React.ReactNode;
    icons?: Record<string, { idle: React.ReactNode; active: React.ReactNode }>;
    onOpenPreview?: (url: string) => void;
  }

  export function ManagerShell(props: ManagerShellProps): React.ReactElement;

  export interface UrlPreviewProps {
    seedUrl?: string;
    endpoints?: AccessEndpoint[];
    endpointsLoading?: boolean;
    loadEndpoints?: () => void;
    placeholder?: string;
    selectLabel?: string;
    loadLabel?: string;
    recentLabel?: string;
    openLabel?: string;
    refreshLabel?: string;
    renderIconBrowser?: () => React.ReactElement;
    renderIconOpen?: () => React.ReactElement;
    renderIconRefresh?: () => React.ReactElement;
    renderIconExternal?: () => React.ReactElement;
  }

  export function UrlPreview(props: UrlPreviewProps): React.ReactElement;

  export function useAccessEndpoints(provider?: CloudBaseData): {
    data: AccessEndpoint[] | undefined;
    error: string | undefined;
    loading: boolean;
    reload: () => void;
  };

  export function createTranslator(
    locale: "zh" | "en",
  ): (key: string, vars?: Record<string, string | number>) => string;

  export function resolvePostgresEnv(ctx: { runtimeMode?: string; isPostgresEnv?: boolean }): boolean;
}
