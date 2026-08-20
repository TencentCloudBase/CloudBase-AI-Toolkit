import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import type { StorageObject } from "../../core/types.js";
import { useKit } from "../../hooks/use-menu.js";
import { useStorageBuckets, useStorageObjects } from "../../hooks/use-resources.js";
import { DegradeNote, EmptyState, ErrorBanner, PageHead, SimpleTable, TabsBar } from "./ResourceParts.js";

export interface StoragePageProps {
  provider?: PlatformProvider;
}

export function StoragePage(props: StoragePageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const buckets = useStorageBuckets(provider);
  const [bucket, setBucket] = React.useState<string | undefined>(undefined);
  const [path, setPath] = React.useState("");
  const files = useStorageObjects(provider, path, bucket);
  const [tab, setTab] = React.useState("files");
  const [acl, setAcl] = React.useState("");
  const [rule, setRule] = React.useState("");
  const [cdnRows, setCdnRows] = React.useState<Array<{ id: string; status: string }>>([]);
  const [hint, setHint] = React.useState<string | undefined>(undefined);
  const crumbs = path.split("/").filter(Boolean);

  React.useEffect(() => {
    if (!bucket || !provider) return;
    void provider.getStorageSecurityRules?.(bucket).then((result) => {
      setAcl(result.aclTag);
      setRule(result.rule ?? "");
    });
    void (async () => {
      if (provider.listCdnCacheItems) {
        setCdnRows(await provider.listCdnCacheItems(bucket));
        return;
      }
      const status = await provider.listCdnCacheConfig?.(bucket);
      setCdnRows([{ id: bucket, status: status?.status ?? "unknown" }]);
    })();
  }, [bucket, provider]);

  const openUrl = async (file: StorageObject) => {
    if (!provider || file.isDirectory) return;
    const result = await provider.storageUrl(file.cloudPath, bucket ? { bucket } : undefined);
    if (result.url && typeof window !== "undefined") window.open(result.url, "_blank");
    setHint("临时链接会过期。");
  };

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("storage.title")} onRefresh={() => buckets.reload()} refreshLabel={kit.tr("common.refresh")} />
      <ErrorBanner error={buckets.error} retry={() => buckets.reload()} retryLabel={kit.tr("common.retry")} />
      <DegradeNote>{kit.tr("storage.bucketCreateUnsupported")}</DegradeNote>

      {!bucket ? (
        <SimpleTable
          columns={[kit.tr("storage.buckets"), "Region", "CDN", "Kind"]}
          empty={kit.tr("storage.empty")}
          rows={(buckets.data ?? []).map((item) => ({
            key: item.name,
            cells: [item.name, item.region ?? "—", item.cdnDomain ?? "—", item.kind ?? "storage"],
            onClick: () => {
              setBucket(item.name);
              setPath("");
              setTab("files");
            },
          }))}
        />
      ) : (
        <>
          <div className="cb-kit-page-actions" style={{ marginBottom: 8 }}>
            <button type="button" className="cb-kit-btn ghost" onClick={() => setBucket(undefined)}>
              ← {kit.tr("storage.buckets")}
            </button>
            <span className="mono">{bucket}</span>
          </div>
          <TabsBar
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "files", label: kit.tr("storage.files") },
              { id: "security", label: kit.tr("storage.security") },
              { id: "cdn", label: kit.tr("storage.cdn") },
            ]}
          />
          {tab === "files" ? (
            <>
              <div className="cb-kit-crumb">
                <button type="button" onClick={() => setPath("")}>
                  /
                </button>
                {crumbs.map((part, index) => (
                  <span key={`${part}-${index}`}>
                    <span> / </span>
                    <button type="button" onClick={() => setPath(crumbs.slice(0, index + 1).join("/") + "/")}>
                      {part}
                    </button>
                  </span>
                ))}
                <span className="cb-spacer" />
                <button
                  type="button"
                  className="cb-kit-btn"
                  onClick={() => {
                    void (async () => {
                      if (provider?.uploadStorage) {
                        await provider.uploadStorage(path || "/", { bucket });
                        files.reload();
                        return;
                      }
                      setHint("上传需宿主实现 uploadStorage（COS）。");
                    })();
                  }}
                >
                  {kit.tr("storage.upload")}
                </button>
              </div>
              {hint ? <div className="cb-kit-banner warn">{hint}</div> : null}
              {(files.data ?? []).length === 0 ? (
                <EmptyState>{kit.tr("common.empty")}</EmptyState>
              ) : (
                <div className="cb-kit-card cb-kit-table">
                  <div className="cb-kit-table-head cols-4">
                    <span>{kit.tr("fn.col.name")}</span>
                    <span>Size</span>
                    <span>{kit.tr("fn.col.updated")}</span>
                    <span />
                  </div>
                  {(files.data ?? []).map((file) => (
                    <div key={file.cloudPath} className="cb-kit-table-row static cols-4">
                      <span>
                        {file.isDirectory ? (
                          <button
                            type="button"
                            className="cb-kit-btn ghost"
                            onClick={() =>
                              setPath(file.cloudPath.endsWith("/") ? file.cloudPath : `${file.cloudPath}/`)
                            }
                          >
                            {file.name}
                          </button>
                        ) : (
                          file.name
                        )}
                      </span>
                      <span>{file.sizeLabel}</span>
                      <span>{file.updatedAt ?? "—"}</span>
                      <span>
                        {!file.isDirectory ? (
                          <button type="button" className="cb-kit-btn ghost" onClick={() => void openUrl(file)}>
                            {kit.tr("storage.link")}
                          </button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
          {tab === "security" ? (
            <div>
              <div className="cb-kit-field">
                <span>AclTag</span>
                <input className="cb-kit-input" value={acl} onChange={(e) => setAcl(e.target.value)} />
              </div>
              <div className="cb-kit-field">
                <span>Rule</span>
                <textarea className="cb-kit-textarea" rows={6} value={rule} onChange={(e) => setRule(e.target.value)} />
              </div>
              <button
                type="button"
                className="cb-kit-btn"
                onClick={() => {
                  void provider?.setStorageSecurityRules?.({ aclTag: acl, rule, bucket });
                }}
              >
                {kit.tr("storage.acl.edit")}
              </button>
            </div>
          ) : null}
          {tab === "cdn" ? (
            <SimpleTable
              columns={["Id", "Status"]}
              empty={kit.tr("common.empty")}
              rows={cdnRows.map((item) => ({
                key: item.id,
                cells: [item.id, item.status],
              }))}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
