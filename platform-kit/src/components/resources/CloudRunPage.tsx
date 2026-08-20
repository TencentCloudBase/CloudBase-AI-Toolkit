import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import {
  useCloudRunDeploys,
  useCloudRunDetail,
  useCloudRunLogs,
  useCloudRunServices,
} from "../../hooks/use-resources.js";
import { DegradeNote, EmptyState, ErrorBanner, PageHead, SimpleTable, TabsBar } from "./ResourceParts.js";

export interface CloudRunPageProps {
  provider?: PlatformProvider;
}

export function CloudRunPage(props: CloudRunPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const list = useCloudRunServices(provider);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const detail = useCloudRunDetail(provider, selected);
  const deploys = useCloudRunDeploys(provider, selected);
  const runId = deploys.data?.[0]?.runId;
  const logs = useCloudRunLogs(provider, selected, runId);
  const [tab, setTab] = React.useState("versions");
  const [buildNote, setBuildNote] = React.useState<string | undefined>(undefined);

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("run.title")} onRefresh={() => list.reload()} refreshLabel={kit.tr("common.refresh")} />
      <ErrorBanner error={list.error} retry={() => list.reload()} retryLabel={kit.tr("common.retry")} />
      <SimpleTable
        columns={["Service", "Status", "Version", "Traffic", "CPU", "Mem"]}
        empty={kit.tr("run.empty")}
        rows={(list.data ?? []).map((item) => ({
          key: item.name,
          cells: [
            item.name,
            item.status ?? "—",
            item.version ?? "—",
            item.traffic ?? "—",
            item.cpu ?? "—",
            item.memory ?? "—",
          ],
          onClick: () => {
            setSelected(item.name);
            setTab("versions");
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
              { id: "versions", label: kit.tr("run.tab.versions") },
              { id: "deploys", label: kit.tr("run.tab.deploys") },
              { id: "logs", label: kit.tr("run.tab.logs") },
            ]}
          />
          {tab === "versions" ? (
            <SimpleTable
              columns={["Version", "Status", "Deployed"]}
              empty={kit.tr("common.empty")}
              rows={(detail.data?.versions ?? []).map((item) => ({
                key: item.versionName,
                cells: [item.versionName, item.status ?? "—", item.deployedAt ?? "—"],
              }))}
            />
          ) : null}
          {tab === "deploys" ? (
            <SimpleTable
              columns={["Id", "Status", "Time", "RunId"]}
              empty={kit.tr("common.empty")}
              rows={(deploys.data ?? []).map((item) => ({
                key: item.id,
                cells: [item.id, item.status ?? "—", item.deployedAt ?? "—", item.runId ?? "—"],
              }))}
            />
          ) : null}
          {tab === "logs" ? (
            <>
              <button
                type="button"
                className="cb-kit-btn ghost"
                onClick={() => {
                  void (async () => {
                    if (!provider?.getCloudRunBuildLog || !selected) {
                      setBuildNote(kit.tr("run.buildLog.coding"));
                      return;
                    }
                    const result = await provider.getCloudRunBuildLog(selected);
                    setBuildNote(result.unsupportedReason ?? result.text);
                  })();
                }}
              >
                Build log
              </button>
              {buildNote ? <DegradeNote>{buildNote}</DegradeNote> : null}
              {(logs.data ?? []).length === 0 ? (
                <EmptyState>{kit.tr("common.empty")}</EmptyState>
              ) : (
                <pre className="cb-kit-code">
                  {(logs.data ?? []).map((line) => `${line.time ?? ""} ${line.message}`).join("\n")}
                </pre>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
