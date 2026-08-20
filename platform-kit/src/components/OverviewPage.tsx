import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import { useAccessEndpoints, useDeployments, useEnvInfo, useUsage } from "../hooks/use-platform.js";
import { useMetricCards } from "../hooks/use-metrics.js";
import { useKit } from "../hooks/use-menu.js";
import { AccessEndpointsList } from "./AccessEndpointsList.js";
import { DeploymentTimeline } from "./DeploymentTimeline.js";
import { MetricCardsGrid } from "./charts/MetricCardsGrid.js";
import { UsageBarsList } from "./charts/UsageBarsList.js";

export interface OverviewPageProps {
  provider?: PlatformProvider;
  onOpenEndpoint?: (url: string) => void;
  onPreviewDeployment?: (url: string) => void;
}

export function OverviewPage(props: OverviewPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const endpoints = useAccessEndpoints(provider);
  const deployments = useDeployments(provider);
  const envInfo = useEnvInfo(provider);
  const metrics = useMetricCards(provider);
  const usage = useUsage(provider);

  const metricLabel = (name: string, fallback: string) => {
    const map: Record<string, Parameters<typeof kit.tr>[0]> = {
      FunctionInvocation: "metric.FunctionInvocation",
      DbRead: "metric.DbRead",
      DbWrite: "metric.DbWrite",
      FunctionError: "metric.FunctionError",
    };
    const key = map[name];
    return key ? kit.tr(key) : fallback;
  };

  return (
    <div className="cb-kit-page">
      <h2 className="cb-kit-page-title">{kit.tr("overview.title")}</h2>

      {envInfo.data ? (
        <div className="cb-kit-section">
          <div className="cb-kit-section-h">{kit.tr("overview.envInfo")}</div>
          <div className="cb-kit-card" style={{ padding: "12px 14px", fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              <div><span style={{ color: "var(--cb-text-3)" }}>EnvId</span><br /><code>{envInfo.data.envId || "—"}</code></div>
              <div><span style={{ color: "var(--cb-text-3)" }}>Region</span><br />{envInfo.data.regionLabel}</div>
              <div><span style={{ color: "var(--cb-text-3)" }}>Runtime</span><br />{envInfo.data.runtimeMode ?? "—"}</div>
              <div><span style={{ color: "var(--cb-text-3)" }}>Functions</span><br />{envInfo.data.functionCount}</div>
              <div><span style={{ color: "var(--cb-text-3)" }}>Hosting</span><br />{envInfo.data.hostingDomainCount}</div>
            </div>
          </div>
        </div>
      ) : null}

      <MetricCardsGrid
        title={kit.tr("overview.metrics.24h")}
        refreshLabel={kit.tr("overview.metrics.refresh")}
        series={metrics.data ?? []}
        loading={metrics.loading}
        onRefresh={() => metrics.reload()}
        labelFor={metricLabel}
        emptyLabel={kit.tr("overview.metrics.empty")}
      />

      <UsageBarsList
        title={kit.tr("overview.usage.cycle")}
        items={usage.data ?? []}
        emptyLabel={kit.tr("overview.usage.empty")}
      />

      <AccessEndpointsList
        title={kit.tr("overview.accessEndpoints")}
        endpoints={endpoints.data ?? []}
        loading={endpoints.loading}
        error={endpoints.error}
        appLabel={kit.tr("resource.app")}
        onOpen={(item) => {
          if (props.onOpenEndpoint) props.onOpenEndpoint(item.url);
          else window.open(item.url, "_blank", "noreferrer");
        }}
      />

      <DeploymentTimeline
        title={kit.tr("overview.deployments")}
        records={deployments.data ?? []}
        loading={deployments.loading}
        error={deployments.error}
        statusLabels={{
          success: kit.tr("deployment.status.success"),
          failed: kit.tr("deployment.status.failed"),
          building: kit.tr("deployment.status.building"),
          pending: kit.tr("deployment.status.pending"),
          unknown: "—",
        }}
        rollbackLabel={kit.tr("deployment.rollback")}
        rollbackConfirm={kit.tr("deployment.rollbackConfirm")}
        expandLabel={kit.tr("deployment.expand")}
        onPreview={(record) => {
          if (record.previewUrl && props.onPreviewDeployment) props.onPreviewDeployment(record.previewUrl);
        }}
        onRollback={provider?.rollbackDeployment ? (r) => provider.rollbackDeployment!(r) : undefined}
      />
    </div>
  );
}
