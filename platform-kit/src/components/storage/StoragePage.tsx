import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import {
  useBucketWriteSupport,
  useCdnCache,
  useStorageBuckets,
  useStorageObjects,
  useStorageRules,
} from "../../hooks/use-resources.js";
import { StorageBucketTable, StorageFileBrowser, StorageRulesPanel } from "./StorageParts.js";

export interface StoragePageProps {
  provider?: PlatformProvider;
}

export function StoragePage(props: StoragePageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const buckets = useStorageBuckets(provider);
  const writeCap = useBucketWriteSupport(provider);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const [prefix, setPrefix] = React.useState("");
  const [tab, setTab] = React.useState<"files" | "rules" | "cdn">("files");
  const files = useStorageObjects(provider, selected, prefix);
  const rules = useStorageRules(provider);
  const cdn = useCdnCache(provider);

  React.useEffect(() => {
    setPrefix("");
    setTab("files");
  }, [selected]);

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("storage.title")}</h2>
        <div className="cb-kit-page-actions">
          {selected ? (
            <button type="button" className="cb-kit-btn ghost" onClick={() => setSelected(undefined)}>
              {kit.tr("fn.back")}
            </button>
          ) : null}
          <button type="button" className="cb-kit-btn ghost" onClick={() => buckets.reload()}>
            {kit.tr("common.refresh")}
          </button>
        </div>
      </div>
      {writeCap.data?.reason ? <div className="cb-kit-banner warn">{kit.tr("storage.bucketWrite.unsupported")}</div> : null}
      {buckets.error ? (
        <div style={{ color: "var(--cb-danger)", marginBottom: 8 }}>{buckets.error}</div>
      ) : null}
      {buckets.loading && !selected ? <div className="cb-kit-restricted">{kit.tr("common.loading")}</div> : null}
      {!selected && !buckets.loading ? (
        <StorageBucketTable
          buckets={buckets.data ?? []}
          empty={kit.tr("storage.emptyBuckets")}
          columns={[
            kit.tr("storage.col.bucket"),
            kit.tr("storage.col.region"),
            kit.tr("storage.col.created"),
            kit.tr("storage.col.size"),
          ]}
          onSelect={setSelected}
        />
      ) : null}
      {selected ? (
        <div>
          <div className="cb-kit-tabs">
            {(["files", "rules", "cdn"] as const).map((id) => {
              const label =
                id === "files"
                  ? kit.tr("storage.tab.files")
                  : id === "rules"
                    ? kit.tr("storage.tab.rules")
                    : kit.tr("storage.tab.cdn");
              return (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? "active" : undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {tab === "files" ? (
            <StorageFileBrowser
              files={files.data ?? []}
              prefix={prefix}
              empty={kit.tr("common.empty")}
              uploadHint={kit.tr("storage.upload.host")}
              onOpenDir={setPrefix}
              onOpenUrl={
                provider
                  ? (cloudPath) => {
                      void provider.storageUrl(cloudPath).then((result) => {
                        if (result.url && typeof window !== "undefined") window.open(result.url, "_blank");
                      });
                    }
                  : undefined
              }
              onUpload={
                provider?.uploadStorage
                  ? () => {
                      void provider.uploadStorage?.({ bucket: selected, prefix });
                    }
                  : undefined
              }
            />
          ) : null}
          {tab === "rules" ? (
            <StorageRulesPanel
              aclTag={rules.data?.aclTag ?? "PRIVATE"}
              rule={rules.data?.rule}
              saveLabel={kit.tr("storage.editRule")}
              onSave={
                provider?.setStorageSecurityRules
                  ? (aclTag, rule) => {
                      void provider.setStorageSecurityRules?.({ aclTag, rule }).then(() => rules.reload());
                    }
                  : undefined
              }
            />
          ) : null}
          {tab === "cdn" ? (
            <div className="cb-kit-card" style={{ padding: 12 }}>
              CDN: {cdn.data?.status ?? "unknown"}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
