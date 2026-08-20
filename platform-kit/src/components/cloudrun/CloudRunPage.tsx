import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import {
  useCloudRunDeploys,
  useCloudRunDetail,
  useCloudRunLogs,
  useCloudRunServices,
} from "../../hooks/use-resources.js";
import { CloudRunDetail, CloudRunTable } from "./CloudRunParts.js";

export interface CloudRunPageProps {
  provider?: PlatformProvider;
}

export function CloudRunPage(props: CloudRunPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const list = useCloudRunServices(provider);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const [logKind, setLogKind] = React.useState<"process" | "build">("process");
  const detail = useCloudRunDetail(provider, selected);
  const deploys = useCloudRunDeploys(provider, selected);
  const logs = useCloudRunLogs(provider, selected, logKind);

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("cr.title")}</h2>
        <div className="cb-kit-page-actions">
          {selected ? (
            <button type="button" className="cb-kit-btn ghost" onClick={() => setSelected(undefined)}>
              {kit.tr("fn.back")}
            </button>
          ) : null}
          <button type="button" className="cb-kit-btn ghost" onClick={() => list.reload()}>
            {kit.tr("common.refresh")}
          </button>
        </div>
      </div>
      {list.error ? (
        <div style={{ color: "var(--cb-danger)", marginBottom: 8 }}>
          {list.error}
          <button type="button" className="cb-kit-btn ghost" style={{ marginLeft: 8 }} onClick={() => list.reload()}>
            {kit.tr("common.retry")}
          </button>
        </div>
      ) : null}
      {list.loading && !selected ? <div className="cb-kit-restricted">{kit.tr("common.loading")}</div> : null}
      {!selected && !list.loading ? (
        <CloudRunTable
          services={list.data ?? []}
          empty={kit.tr("cr.empty")}
          columns={[
            kit.tr("cr.col.name"),
            kit.tr("cr.col.status"),
            kit.tr("cr.col.version"),
            kit.tr("cr.col.traffic"),
            kit.tr("cr.col.cpu"),
            kit.tr("cr.col.memory"),
            kit.tr("cr.col.instances"),
          ]}
          onSelect={setSelected}
        />
      ) : null}
      {selected ? (
        <CloudRunDetail
          versions={detail.data?.versions ?? []}
          deploys={deploys.data ?? []}
          logLines={logs.data?.lines ?? []}
          logNotice={logs.data?.notice ?? (logKind === "build" ? kit.tr("cr.buildLog.unsupported") : undefined)}
          logKind={logKind}
          onLogKind={setLogKind}
          labels={{
            "cr.tab.versions": kit.tr("cr.tab.versions"),
            "cr.tab.deploys": kit.tr("cr.tab.deploys"),
            "cr.tab.logs": kit.tr("cr.tab.logs"),
            "common.empty": kit.tr("common.empty"),
          }}
        />
      ) : null}
    </div>
  );
}
