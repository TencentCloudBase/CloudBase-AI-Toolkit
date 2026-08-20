import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import { useDebouncedValue, useFunctionDetail, useFunctionLogs, useFunctions } from "../../hooks/use-resources.js";
import { filterFunctions } from "../../services/resource-map.js";
import { DegradeNote, ErrorBanner, KvList, PageHead, SimpleTable, TabsBar } from "./ResourceParts.js";

export interface FunctionsPageProps {
  provider?: PlatformProvider;
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
  const [invokeHint, setInvokeHint] = React.useState<string | undefined>(undefined);

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
      <ErrorBanner error={list.error} retry={() => list.reload()} retryLabel={kit.tr("common.retry")} />
      <SimpleTable
        columns={[
          kit.tr("fn.col.name"),
          kit.tr("fn.col.runtime"),
          kit.tr("fn.col.status"),
          kit.tr("fn.col.invokes"),
          kit.tr("fn.col.updated"),
        ]}
        empty={kit.tr("fn.empty")}
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
        <div className="cb-kit-section" style={{ marginTop: 16 }}>
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
                { k: "Runtime", v: detail.data?.runtime ?? "—" },
                { k: "Status", v: detail.data?.status ?? "—" },
                { k: "Handler", v: detail.data?.handler ?? "—" },
                { k: "Timeout", v: detail.data?.timeout != null ? String(detail.data.timeout) : "—" },
                { k: "Memory", v: detail.data?.memorySize != null ? String(detail.data.memorySize) : "—" },
                { k: "Updated", v: detail.data?.updatedAt ?? "—" },
              ]}
            />
          ) : null}
          {tab === "env" ? (
            <KvList
              rows={(detail.data?.environment ?? []).map((item) => ({ k: item.key, v: item.value }))}
            />
          ) : null}
          {tab === "triggers" ? (
            <SimpleTable
              columns={["Name", "Type", "Desc"]}
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
                columns={["Time", "RequestId", "Message"]}
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
              <DegradeNote>{kit.tr("fn.invoke.unsupported")}</DegradeNote>
              <button
                type="button"
                className="cb-kit-btn"
                onClick={() => {
                  void (async () => {
                    if (!provider?.invokeFunction || !selected) {
                      setInvokeHint(kit.tr("fn.invoke.unsupported"));
                      return;
                    }
                    const result = await provider.invokeFunction(selected, "{}");
                    setInvokeHint(result.unsupportedReason ?? result.result);
                  })();
                }}
              >
                {kit.tr("fn.tab.invoke")}
              </button>
              {invokeHint ? <pre className="cb-kit-code">{invokeHint}</pre> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
