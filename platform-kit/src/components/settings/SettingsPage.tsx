import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useEnvInfo } from "../../hooks/use-platform.js";
import { useKit } from "../../hooks/use-menu.js";
import { useAsyncResource } from "../../hooks/use-platform.js";
import { ErrorBanner, KvList, PageHead } from "../resources/ResourceParts.js";

export interface SettingsPageProps {
  provider?: PlatformProvider;
}

export function SettingsPage(props: SettingsPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const envInfo = useEnvInfo(provider);
  const secrets = useAsyncResource(
    () => (provider ? provider.listSecrets() : Promise.resolve([])),
    [provider],
  );
  const authDomains = useAsyncResource(
    () => (provider?.listAuthDomains ? provider.listAuthDomains() : Promise.resolve([])),
    [provider],
  );
  const qps = useAsyncResource(
    () => (provider?.getGatewayQpsLimit ? provider.getGatewayQpsLimit() : Promise.resolve(undefined)),
    [provider],
  );
  const gateway = useAsyncResource(
    () => (provider ? provider.getGatewayPrivilege() : Promise.resolve({ enableService: false, enableAuth: false })),
    [provider],
  );

  const refresh = () => {
    envInfo.reload();
    secrets.reload();
    authDomains.reload();
    qps.reload();
    gateway.reload();
  };

  return (
    <div className="cb-kit-page" data-testid="cb-page-settings">
      <PageHead title={kit.tr("settings.title")} onRefresh={refresh} refreshLabel={kit.tr("common.refresh")} />
      <ErrorBanner error={envInfo.error} retry={refresh} retryLabel={kit.tr("common.retry")} />

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.envInfo")}</div>
        <KvList
          rows={[
            { k: "EnvId", v: envInfo.data?.envId ?? "—" },
            { k: kit.tr("settings.region"), v: envInfo.data?.regionLabel ?? "—" },
            { k: "Runtime", v: envInfo.data?.runtimeMode ?? "—" },
            { k: kit.tr("settings.timezone"), v: envInfo.data?.timezone ?? "—" },
            { k: "Functions", v: envInfo.data ? String(envInfo.data.functionCount) : "—" },
            { k: "Hosting", v: envInfo.data ? String(envInfo.data.hostingDomainCount) : "—" },
          ]}
        />
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("gateway.authEnabled")}</div>
        <KvList
          rows={[
            { k: kit.tr("gateway.serviceEnabled"), v: gateway.data?.enableService ? "ON" : "OFF" },
            { k: kit.tr("gateway.authEnabled"), v: gateway.data?.enableAuth ? "ON" : "OFF" },
            { k: kit.tr("settings.qps"), v: qps.data != null ? String(qps.data) : "—" },
          ]}
        />
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.authDomains")}</div>
        {(authDomains.data ?? []).length === 0 ? (
          <div className="cb-kit-restricted">{kit.tr("common.empty")}</div>
        ) : (
          <KvList rows={(authDomains.data ?? []).map((d) => ({ k: d.domain, v: d.id || "—" }))} />
        )}
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.secrets")}</div>
        {(secrets.data ?? []).length === 0 ? (
          <div className="cb-kit-restricted">{kit.tr("common.empty")}</div>
        ) : (
          <KvList
            rows={(secrets.data ?? []).map((s) => ({
              k: `${s.source}/${s.key}`,
              v: s.valueMasked,
            }))}
          />
        )}
      </div>
    </div>
  );
}
