import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useDebouncedValue } from "../../hooks/use-debounce.js";
import { useKit } from "../../hooks/use-menu.js";
import { useFunctionDetail, useFunctionLogs, useFunctions } from "../../hooks/use-resources.js";
import { FunctionDetail, FunctionsTable } from "./FunctionsParts.js";

export interface FunctionsPageProps {
  provider?: PlatformProvider;
}

export function FunctionsPage(props: FunctionsPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const [keyword, setKeyword] = React.useState("");
  const searchKey = useDebouncedValue(keyword);
  const list = useFunctions(provider, searchKey);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const detail = useFunctionDetail(provider, selected);
  const logs = useFunctionLogs(provider, selected);

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("fn.title")}</h2>
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
      {selected ? null : (
        <div style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
          <input
            className="cb-kit-input flex"
            placeholder={kit.tr("fn.search")}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      )}
      {list.error || detail.error ? (
        <div style={{ color: "var(--cb-danger)", marginBottom: 8 }}>
          {list.error ?? detail.error}
          <button type="button" className="cb-kit-btn ghost" style={{ marginLeft: 8 }} onClick={() => list.reload()}>
            {kit.tr("common.retry")}
          </button>
        </div>
      ) : null}
      {list.loading && !selected ? <div className="cb-kit-restricted">{kit.tr("common.loading")}</div> : null}
      {!selected && !list.loading ? (
        <FunctionsTable
          functions={list.data ?? []}
          empty={kit.tr("fn.empty")}
          columns={[
            kit.tr("fn.col.name"),
            kit.tr("fn.col.runtime"),
            kit.tr("fn.col.status"),
            kit.tr("fn.col.invokes"),
            kit.tr("fn.col.updated"),
          ]}
          onSelect={setSelected}
        />
      ) : null}
      {selected && detail.data ? (
        <FunctionDetail
          detail={detail.data}
          logs={logs.data ?? []}
          labels={{
            "fn.tab.config": kit.tr("fn.tab.config"),
            "fn.tab.env": kit.tr("fn.tab.env"),
            "fn.tab.triggers": kit.tr("fn.tab.triggers"),
            "fn.tab.logs": kit.tr("fn.tab.logs"),
            "fn.invoke.unsupported": kit.tr("fn.invoke.unsupported"),
            "common.empty": kit.tr("common.empty"),
          }}
        />
      ) : null}
    </div>
  );
}
