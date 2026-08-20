import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useEnvInfo } from "../../hooks/use-platform.js";
import { useKit } from "../../hooks/use-menu.js";
import { useGatewayMutations, useGatewayPrivilege } from "../../hooks/use-gateway-routes.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ErrorBanner, KvList, PageHead } from "../resources/ResourceParts.js";

export interface SettingsPageProps {
  provider?: PlatformProvider;
}

export function SettingsPage(props: SettingsPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const envInfo = useEnvInfo(provider);
  const privilege = useGatewayPrivilege(provider);
  const mutations = useGatewayMutations(provider);
  const [secrets, setSecrets] = React.useState<Array<{ key: string; value: string }>>([]);
  const [authDomains, setAuthDomains] = React.useState<Array<{ domain: string; id?: string; status?: string }>>([]);
  const [authDomainsError, setAuthDomainsError] = React.useState<string | undefined>(undefined);
  const [qpsLabel, setQpsLabel] = React.useState("—");
  const [serviceEnabled, setServiceEnabled] = React.useState(true);
  const [authEnabled, setAuthEnabled] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string | undefined>(undefined);
  const [confirmDeleteDomain, setConfirmDeleteDomain] = React.useState<
    { domain: string; id?: string } | undefined
  >(undefined);

  React.useEffect(() => {
    setServiceEnabled(Boolean(privilege.data?.enableService));
    setAuthEnabled(Boolean(privilege.data?.enableAuth));
  }, [privilege.data?.enableAuth, privilege.data?.enableService]);

  const reloadAuthDomains = React.useCallback(() => {
    if (!provider?.listAuthDomains) {
      setAuthDomains([]);
      return;
    }
    provider
      .listAuthDomains()
      .then((items) => {
        setAuthDomains(items);
        setAuthDomainsError(undefined);
      })
      .catch((error) => {
        setAuthDomains([]);
        setAuthDomainsError(error instanceof Error ? error.message : String(error));
      });
  }, [provider]);

  React.useEffect(() => {
    if (!provider) return;
    void provider
      .listSecrets()
      .then((items) => setSecrets(items.map((item) => ({ key: item.key, value: item.valueMasked ?? "—" }))))
      .catch(() => setSecrets([]));
    reloadAuthDomains();
    void (async () => {
      const capi = provider.capi;
      if (!capi || !envInfo.data?.envId) return;
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
  }, [provider, envInfo.data?.envId, reloadAuthDomains]);

  const toggleService = async (enable: boolean) => {
    setMutationError(undefined);
    setServiceEnabled(enable);
    try {
      await mutations.toggleService(enable);
      privilege.reload();
    } catch (error) {
      setServiceEnabled(!enable);
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleAuth = async (enable: boolean) => {
    setMutationError(undefined);
    setAuthEnabled(enable);
    try {
      await mutations.toggleAuth(enable);
      privilege.reload();
    } catch (error) {
      setAuthEnabled(!enable);
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteDomain = async () => {
    const target = confirmDeleteDomain;
    setConfirmDeleteDomain(undefined);
    if (!target?.id || !provider?.deleteAuthDomain) return;
    setMutationError(undefined);
    try {
      await provider.deleteAuthDomain(target.id, true);
      reloadAuthDomains();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("settings.title")} onRefresh={() => envInfo.reload()} refreshLabel={kit.tr("common.refresh")} />
      <ErrorBanner error={envInfo.error} retry={() => envInfo.reload()} retryLabel={kit.tr("common.retry")} />
      {mutationError ? <ErrorBanner error={`${kit.tr("gateway.mutationError")}: ${mutationError}`} /> : null}

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
        <div className="cb-kit-card cb-kit-table">
          <div className="cb-kit-table-row static cols-4">
            <span className="mono">{kit.tr("gateway.serviceEnabled")}</span>
            <span className="cb-kit-span-3">
              <label className="cb-kit-toggle">
                <input
                  type="checkbox"
                  checked={serviceEnabled}
                  disabled={mutations.pending || !provider?.setGatewayServiceEnabled}
                  onChange={(e) => void toggleService(e.target.checked)}
                />
              </label>
            </span>
          </div>
          <div className="cb-kit-table-row static cols-4">
            <span className="mono">{kit.tr("gateway.authEnabled")}</span>
            <span className="cb-kit-span-3">
              <label className="cb-kit-toggle">
                <input
                  type="checkbox"
                  checked={authEnabled}
                  disabled={mutations.pending || !provider?.setGatewayAuthEnabled}
                  onChange={(e) => void toggleAuth(e.target.checked)}
                />
              </label>
            </span>
          </div>
          <div className="cb-kit-table-row static cols-4">
            <span className="mono">{kit.tr("settings.qps")}</span>
            <span className="mono cb-kit-span-3">{qpsLabel}</span>
          </div>
        </div>
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("settings.authDomains")}</div>
        {authDomainsError ? <ErrorBanner error={authDomainsError} retry={reloadAuthDomains} retryLabel={kit.tr("common.retry")} /> : null}
        {authDomains.length === 0 ? (
          <div className="cb-kit-empty">{kit.tr("common.empty")}</div>
        ) : (
          <div className="cb-kit-card cb-kit-table">
            {authDomains.map((item) => (
              <div key={item.id ?? item.domain} className="cb-kit-table-row static cols-4">
                <span className="mono">{item.domain}</span>
                <span className="mono">{item.status ?? "—"}</span>
                <span className="cb-kit-span-2 cb-kit-spread">
                  <button
                    type="button"
                    className="cb-kit-btn ghost"
                    disabled={!item.id || !provider?.deleteAuthDomain}
                    onClick={() => setConfirmDeleteDomain({ domain: item.domain, id: item.id })}
                  >
                    {kit.tr("settings.authDomains.delete")}
                  </button>
                </span>
              </div>
            ))}
          </div>
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

      <ConfirmDialog
        open={Boolean(confirmDeleteDomain)}
        title={kit.tr("settings.authDomains.deleteConfirm")}
        body={confirmDeleteDomain?.domain ?? ""}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={kit.tr("common.cancel")}
        pending={mutations.pending}
        onCancel={() => setConfirmDeleteDomain(undefined)}
        onConfirm={() => void deleteDomain()}
      />
    </div>
  );
}
