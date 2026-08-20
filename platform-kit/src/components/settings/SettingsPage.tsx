import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useEnvInfo } from "../../hooks/use-platform.js";
import { useKit } from "../../hooks/use-menu.js";
import { useGatewayPrivilege } from "../../hooks/use-gateway-routes.js";
import { ErrorBanner, KvList, PageHead } from "../resources/ResourceParts.js";

export interface SettingsPageProps {
  provider?: PlatformProvider;
}

export function SettingsPage(props: SettingsPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const envInfo = useEnvInfo(provider);
  const privilege = useGatewayPrivilege(provider);
  const [secrets, setSecrets] = React.useState<Array<{ key: string; value: string }>>([]);
  const [authDomains, setAuthDomains] = React.useState<Array<{ domain: string; status?: string }>>([]);
  const [qpsLabel, setQpsLabel] = React.useState("—");

  React.useEffect(() => {
    if (!provider) return;
    void provider
      .listSecrets()
      .then((items) => setSecrets(items.map((item) => ({ key: item.key, value: item.valueMasked ?? "—" }))))
      .catch(() => setSecrets([]));
    void (async () => {
      const capi = provider.capi;
      if (!capi || !envInfo.data?.envId) return;
      try {
        const payload = (await capi("tcb", "DescribeAuthDomains", { EnvId: envInfo.data.envId })) as Record<
          string,
          unknown
        >;
        const domains = Array.isArray(payload.Domains)
          ? payload.Domains
          : Array.isArray(payload.AuthDomains)
            ? payload.AuthDomains
            : [];
        setAuthDomains(
          domains.map((item) => {
            const row = item as Record<string, unknown>;
            return {
              domain: String(row.Domain ?? row.domain ?? ""),
              status: row.Status ? String(row.Status) : undefined,
            };
          }),
        );
      } catch {
        setAuthDomains([]);
      }
      try {
        const curve = (await capi("tcb", "DescribeCurveData", {
          EnvId: envInfo.data.envId,
          MetricName: "GatewayTraceEnvQPS",
          Period: 3600,
        })) as Record<string, unknown>;
        const values = (curve.Values ?? curve.values) as unknown[];
        const latest = Array.isArray(values) ? values[values.length - 1] : undefined;
        setQpsLabel(typeof latest === "number" ? String(Math.round(latest)) : "—");
      } catch {
        setQpsLabel("—");
      }
    })();
  }, [provider, envInfo.data?.envId]);

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("settings.title")} onRefresh={() => envInfo.reload()} refreshLabel={kit.tr("common.refresh")} />
      <ErrorBanner error={envInfo.error} retry={() => envInfo.reload()} retryLabel={kit.tr("common.retry")} />

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.envInfo")}</div>
        <KvList
          rows={[
            { k: kit.tr("settings.envId"), v: envInfo.data?.envId ?? "—" },
            { k: kit.tr("settings.region"), v: envInfo.data?.regionLabel ?? "—" },
            { k: kit.tr("settings.runtime"), v: envInfo.data?.runtimeMode ?? "—" },
            { k: kit.tr("settings.timezone"), v: envInfo.data?.timezone ?? "—" },
            { k: kit.tr("settings.functions"), v: envInfo.data ? String(envInfo.data.functionCount) : "—" },
          ]}
        />
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.gateway")}</div>
        <KvList
          rows={[
            {
              k: kit.tr("gateway.serviceEnabled"),
              v: privilege.data?.enableService ? kit.tr("common.yes") : kit.tr("common.no"),
            },
            {
              k: kit.tr("gateway.authEnabled"),
              v: privilege.data?.enableAuth ? kit.tr("common.yes") : kit.tr("common.no"),
            },
            { k: kit.tr("settings.qps"), v: qpsLabel },
          ]}
        />
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.authDomains")}</div>
        {authDomains.length === 0 ? (
          <div className="cb-kit-empty">{kit.tr("common.empty")}</div>
        ) : (
          <KvList rows={authDomains.map((item) => ({ k: item.domain, v: item.status ?? "—" }))} />
        )}
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.secrets")}</div>
        {secrets.length === 0 ? (
          <div className="cb-kit-empty">{kit.tr("settings.secretsEmpty")}</div>
        ) : (
          <KvList rows={secrets.map((item) => ({ k: item.key, v: item.value }))} />
        )}
      </div>
    </div>
  );
}
