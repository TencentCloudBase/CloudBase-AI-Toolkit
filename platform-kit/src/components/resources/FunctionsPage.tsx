import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import { useDebouncedValue, useFunctionDetail, useFunctionLogs, useFunctions } from "../../hooks/use-resources.js";
import { filterFunctions } from "../../services/resource-map.js";
import { DegradeNote, EmptyState, ErrorBanner, KvList, PageHead, SimpleTable, TabsBar } from "./ResourceParts.js";

export interface FunctionsPageProps {
  provider?: PlatformProvider;
}

function looksUnavailable(error?: string): boolean {
  if (!error) return false;
  return /not support|does not support|不适用|unsupported|not available|InvalidAction|UnknownOperation/i.test(error);
}

export function FunctionsPage(props: FunctionsPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const [keyword, setKeyword] = React.useState("");
  const debounced = useDebouncedValue(keyword, 200);
  const list = useFunctions(provider, debounced);
  const filtered = filterFunctions(list.data ?? [], keyword);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const detail = useFunctionDetail(provider, selected);
  const logs = useFunctionLogs(provider, selected);
  const [tab, setTab] = React.useState("config");
  const [payload, setPayload] = React.useState("{}");
  const [invokeResult, setInvokeResult] = React.useState<string | undefined>(undefined);
  const [invokeLoading, setInvokeLoading] = React.useState(false);

  const emptyNode = (
    <EmptyState>{kit.tr("fn.emptyGuide")}</EmptyState>
  );

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("fn.title")} onRefresh={() => list.reload()} refreshLabel={kit.tr("common.refresh")}>
        <input
          className="cb-kit-input flex"
          placeholder={kit.tr("fn.search")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </PageHead>
      {looksUnavailable(list.error) ? (
        <DegradeNote>{list.error}</DegradeNote>
      ) : (
        <ErrorBanner error={list.error} retry={() => list.reload()} retryLabel={kit.tr("common.retry")} />
      )}
      <SimpleTable
        loading={list.loading}
        loadingLabel={kit.tr("table.loading")}
        columns={[
          kit.tr("fn.col.name"),
          kit.tr("fn.col.runtime"),
          kit.tr("fn.col.status"),
          kit.tr("fn.col.invokes"),
          kit.tr("fn.col.updated"),
        ]}
        empty={emptyNode}
        rows={filtered.map((item) => ({
          key: item.name,
          cells: [
            item.name,
            item.runtime ?? "—",
            item.status ?? "—",
            item.invokeCount != null ? String(item.invokeCount) : "—",
            item.updatedAt ?? "—",
          ],
          onClick: () => {
            setSelected(item.name);
            setTab("config");
          },
        }))}
      />
      {selected ? (
        <div className="cb-kit-section">
          <div className="cb-kit-section-h">{selected}</div>
          <TabsBar
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "config", label: kit.tr("fn.tab.config") },
              { id: "env", label: kit.tr("fn.tab.env") },
              { id: "triggers", label: kit.tr("fn.tab.triggers") },
              { id: "logs", label: kit.tr("fn.tab.logs") },
              { id: "invoke", label: kit.tr("fn.tab.invoke") },
            ]}
          />
          <ErrorBanner error={detail.error} retry={() => detail.reload()} retryLabel={kit.tr("common.retry")} />
          {tab === "config" ? (
            <KvList
              rows={[
                { k: kit.tr("fn.col.runtime"), v: detail.data?.runtime ?? "—" },
                { k: kit.tr("fn.col.status"), v: detail.data?.status ?? "—" },
                { k: kit.tr("fn.col.handler"), v: detail.data?.handler ?? "—" },
                { k: kit.tr("fn.col.timeout"), v: detail.data?.timeout != null ? String(detail.data.timeout) : "—" },
                { k: kit.tr("fn.col.memory"), v: detail.data?.memorySize != null ? String(detail.data.memorySize) : "—" },
                { k: kit.tr("fn.col.updated"), v: detail.data?.updatedAt ?? "—" },
              ]}
            />
          ) : null}
          {tab === "env" ? (
            <KvList rows={(detail.data?.environment ?? []).map((item) => ({ k: item.key, v: item.value }))} />
          ) : null}
          {tab === "triggers" ? (
            <SimpleTable
              columns={[kit.tr("fn.col.triggerName"), kit.tr("fn.col.triggerType"), kit.tr("fn.col.triggerDesc")]}
              empty={kit.tr("common.empty")}
              rows={(detail.data?.triggers ?? []).map((item) => ({
                key: item.name,
                cells: [item.name, item.type, item.triggerDesc ?? "—"],
              }))}
            />
          ) : null}
          {tab === "logs" ? (
            <>
              {logs.error ? <DegradeNote>{kit.tr("fn.logs.clsFallback")}</DegradeNote> : null}
              <SimpleTable
                loading={logs.loading}
                loadingLabel={kit.tr("table.loading")}
                columns={[kit.tr("fn.col.time"), kit.tr("fn.col.requestId"), kit.tr("fn.col.message")]}
                empty={kit.tr("common.empty")}
                rows={(logs.data ?? []).map((item, index) => ({
                  key: item.requestId ?? String(index),
                  cells: [item.time ?? "—", item.requestId ?? "—", item.message || "—"],
                }))}
              />
            </>
          ) : null}
          {tab === "invoke" ? (
            <div>
              <label className="cb-kit-field">
                <span>{kit.tr("fn.invoke.payload")}</span>
                <textarea className="cb-kit-textarea" rows={6} value={payload} onChange={(e) => setPayload(e.target.value)} />
              </label>
              <button
                type="button"
                className="cb-kit-btn"
                disabled={invokeLoading || !provider?.invokeFunction}
                onClick={() => {
                  void (async () => {
                    if (!provider?.invokeFunction || !selected) return;
                    setInvokeLoading(true);
                    setInvokeResult(undefined);
                    try {
                      const result = await provider.invokeFunction(selected, payload);
                      setInvokeResult(result.result || kit.tr("common.empty"));
                    } catch (error) {
                      setInvokeResult(error instanceof Error ? error.message : String(error));
                    } finally {
                      setInvokeLoading(false);
                    }
                  })();
                }}
              >
                {invokeLoading ? kit.tr("fn.invoke.loading") : kit.tr("fn.invoke.run")}
              </button>
              {invokeResult ? (
                <div className="cb-kit-field">
                  <span>{kit.tr("fn.invoke.result")}</span>
                  <pre className="cb-kit-code">{invokeResult}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
