import * as React from "react";
import type { CloudRunDeployRecord, CloudRunService, CloudRunVersion } from "../../core/types.js";
import { KitTable } from "../KitTable.js";

export function CloudRunTable(props: {
  services: CloudRunService[];
  empty: string;
  columns: string[];
  onSelect: (name: string) => void;
}): React.ReactElement {
  return (
    <KitTable
      colsClass="cols-7"
      columns={props.columns}
      empty={props.empty}
      rows={props.services.map((svc) => ({
        key: svc.name,
        onClick: () => props.onSelect(svc.name),
        cells: [
          <span className="mono" key="n">{svc.name}</span>,
          svc.status ?? "—",
          svc.version ?? "—",
          svc.traffic ?? "—",
          svc.cpu ?? "—",
          svc.memory ?? "—",
          svc.instanceCount ?? "—",
        ],
      }))}
    />
  );
}

export function CloudRunDetail(props: {
  versions: CloudRunVersion[];
  deploys: CloudRunDeployRecord[];
  logLines: string[];
  logNotice?: string;
  labels: Record<string, string>;
  logKind: "process" | "build";
  onLogKind: (kind: "process" | "build") => void;
}): React.ReactElement {
  const [tab, setTab] = React.useState<"versions" | "deploys" | "logs">("versions");
  return (
    <div>
      <div className="cb-kit-tabs">
        {(["versions", "deploys", "logs"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : undefined}
            onClick={() => setTab(id)}
          >
            {props.labels[`cr.tab.${id}`]}
          </button>
        ))}
      </div>
      {tab === "versions" ? (
        <KitTable
          colsClass="cols-4"
          columns={["Version", "Status", "Deployed", ""]}
          empty={props.labels["common.empty"]}
          rows={props.versions.map((item) => ({
            key: item.versionName,
            cells: [item.versionName, item.status ?? "—", item.deployedAt ?? "—", ""],
          }))}
        />
      ) : null}
      {tab === "deploys" ? (
        <KitTable
          colsClass="cols-4"
          columns={["Id", "Version", "Status", "Time"]}
          empty={props.labels["common.empty"]}
          rows={props.deploys.map((item) => ({
            key: item.id,
            cells: [item.id, item.versionName ?? "—", item.status ?? "—", item.deployedAt ?? "—"],
          }))}
        />
      ) : null}
      {tab === "logs" ? (
        <div>
          <div className="cb-kit-tabs">
            <button
              type="button"
              className={props.logKind === "process" ? "active" : undefined}
              onClick={() => props.onLogKind("process")}
            >
              process
            </button>
            <button
              type="button"
              className={props.logKind === "build" ? "active" : undefined}
              onClick={() => props.onLogKind("build")}
            >
              build
            </button>
          </div>
          {props.logNotice ? <div className="cb-kit-banner warn">{props.logNotice}</div> : null}
          {props.logLines.length === 0 ? (
            <div className="cb-kit-restricted">{props.labels["common.empty"]}</div>
          ) : (
            <pre className="cb-kit-code">{props.logLines.join("\n")}</pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
