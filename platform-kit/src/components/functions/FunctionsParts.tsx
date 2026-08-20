import * as React from "react";
import type { CloudFunctionDetail, CloudFunctionSummary, FunctionLogRow } from "../../core/types.js";
import { KitTable } from "../KitTable.js";

export function FunctionsTable(props: {
  functions: CloudFunctionSummary[];
  empty: string;
  columns: string[];
  onSelect: (name: string) => void;
}): React.ReactElement {
  return (
    <KitTable
      colsClass="cols-5"
      columns={props.columns}
      empty={props.empty}
      rows={props.functions.map((fn) => ({
        key: fn.name,
        onClick: () => props.onSelect(fn.name),
        cells: [
          <span className="mono" key="n">{fn.name}</span>,
          fn.runtime ?? "—",
          fn.status ?? "—",
          fn.invokeCount == null ? "—" : String(fn.invokeCount),
          fn.updatedAt ?? "—",
        ],
      }))}
    />
  );
}

export function FunctionDetail(props: {
  detail: CloudFunctionDetail;
  logs: FunctionLogRow[];
  labels: Record<string, string>;
}): React.ReactElement {
  const [tab, setTab] = React.useState<"config" | "env" | "triggers" | "logs">("config");
  return (
    <div>
      <div className="cb-kit-tabs">
        {(["config", "env", "triggers", "logs"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : undefined}
            onClick={() => setTab(id)}
          >
            {props.labels[`fn.tab.${id}`]}
          </button>
        ))}
      </div>
      {tab === "config" ? (
        <div className="cb-kit-card" style={{ padding: 12 }}>
          <div>Handler: <span className="mono">{props.detail.handler ?? "—"}</span></div>
          <div>Runtime: {props.detail.runtime ?? "—"}</div>
          <div>Status: {props.detail.status ?? "—"}</div>
          <div>Timeout: {props.detail.timeout ?? "—"}</div>
          <div>Memory: {props.detail.memorySize ?? "—"}</div>
        </div>
      ) : null}
      {tab === "env" ? (
        <KitTable
          colsClass="cols-4"
          columns={["Key", "Value", "", ""]}
          empty={props.labels["common.empty"]}
          rows={props.detail.environment.map((item) => ({
            key: item.key,
            cells: [item.key, item.value, "", ""],
          }))}
        />
      ) : null}
      {tab === "triggers" ? (
        <KitTable
          colsClass="cols-4"
          columns={["Name", "Type", "Desc", ""]}
          empty={props.labels["common.empty"]}
          rows={props.detail.triggers.map((item) => ({
            key: `${item.type}-${item.name}`,
            cells: [item.name, item.type, item.triggerDesc ?? "—", ""],
          }))}
        />
      ) : null}
      {tab === "logs" ? (
        <KitTable
          colsClass="cols-4"
          columns={["Time", "RequestId", "Status", "Log"]}
          empty={props.labels["common.empty"]}
          rows={props.logs.map((item, index) => ({
            key: item.requestId ?? String(index),
            cells: [
              item.startTime ?? "—",
              <span className="mono truncate" key="id">{item.requestId ?? "—"}</span>,
              item.status ?? "—",
              <span className="truncate" key="log">{item.log ?? "—"}</span>,
            ],
          }))}
        />
      ) : null}
      <div className="cb-kit-banner warn" style={{ marginTop: 12 }}>
        {props.labels["fn.invoke.unsupported"]}
      </div>
    </div>
  );
}
