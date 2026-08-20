import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import type { StorageObject } from "../../core/types.js";
import { useKit } from "../../hooks/use-menu.js";
import { useStorageBuckets, useStorageObjects } from "../../hooks/use-resources.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import {
  DegradeNote,
  EmptyState,
  ErrorBanner,
  InlineMessage,
  PageHead,
  SimpleTable,
  TabsBar,
} from "./ResourceParts.js";

export interface StoragePageProps {
  provider?: PlatformProvider;
}

export function StoragePage(props: StoragePageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const isPg = kit.featureCtx.isPostgresEnv ?? false;
  const buckets = useStorageBuckets(provider);
  const [bucket, setBucket] = React.useState<string | undefined>(undefined);
  const [path, setPath] = React.useState("");
  const files = useStorageObjects(provider, path, bucket);
  const [tab, setTab] = React.useState("files");
  const [acl, setAcl] = React.useState("");
  const [rule, setRule] = React.useState("");
  const [cdnRows, setCdnRows] = React.useState<Array<{ id: string; status: string }>>([]);
  const [hint, setHint] = React.useState<string | undefined>(undefined);
  const [newBucket, setNewBucket] = React.useState("");
  const bucketInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | undefined>(undefined);
  const [uploading, setUploading] = React.useState(false);
  const [confirmSecurity, setConfirmSecurity] = React.useState(false);
  const [confirmDeleteBucket, setConfirmDeleteBucket] = React.useState<string | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
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
    setHint(kit.tr("storage.link"));
  };

  const uploadSelected = async () => {
    if (!provider?.uploadStorage || !selectedFile || !bucket) return;
    setUploading(true);
    setHint(undefined);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
      const fileBase64 = btoa(binary);
      const targetPath = path.endsWith("/") || !path ? path || "" : `${path}/`;
      await provider.uploadStorage(targetPath, {
        bucket,
        fileBase64,
        fileName: selectedFile.name,
        contentType: selectedFile.type || "application/octet-stream",
      });
      setHint(kit.tr("storage.uploadSuccess"));
      files.reload();
    } catch (error) {
      setHint(`${kit.tr("storage.uploadFailed")}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const createBucket = async () => {
    if (!provider?.createStorageBucket || !newBucket.trim()) return;
    try {
      await provider.createStorageBucket(newBucket.trim());
      setNewBucket("");
      buckets.reload();
      setHint(kit.tr("common.success"));
    } catch (error) {
      setHint(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("storage.title")} onRefresh={() => buckets.reload()} refreshLabel={kit.tr("common.refresh")} />
      <ErrorBanner error={buckets.error} retry={() => buckets.reload()} retryLabel={kit.tr("common.retry")} />
      {!isPg ? <DegradeNote>{kit.tr("storage.bucketCreateUnsupported")}</DegradeNote> : null}

      {!bucket ? (
        <>
          {isPg ? (
            <div className="cb-kit-spread cb-kit-page-actions">
              <input
                ref={bucketInputRef}
                className="cb-kit-input flex"
                placeholder={kit.tr("storage.createHint")}
                value={newBucket}
                onChange={(e) => setNewBucket(e.target.value)}
              />
              <button type="button" className="cb-kit-btn" onClick={() => void createBucket()} disabled={!newBucket.trim()}>
                {kit.tr("storage.createBucket")}
              </button>
            </div>
          ) : null}
          <SimpleTable
            loading={buckets.loading}
            loadingLabel={kit.tr("table.loading")}
            columns={[
              kit.tr("storage.buckets"),
              kit.tr("storage.col.region"),
              kit.tr("storage.col.cdn"),
              kit.tr("storage.col.kind"),
            ]}
            empty={
              <EmptyState
                action={
                  isPg ? (
                    <button type="button" className="cb-kit-btn" onClick={() => bucketInputRef.current?.focus()}>
                      {kit.tr("storage.createBucket")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cb-kit-btn"
                      onClick={() => {
                        const href = `https://tcb.cloud.tencent.com/dev?envId=${encodeURIComponent(kit.featureCtx.envId ?? "")}#/storage`;
                        if (typeof window !== "undefined") window.open(href, "_blank", "noreferrer");
                      }}
                    >
                      {kit.tr("storage.consoleOpen")}
                    </button>
                  )
                }
              >
                {kit.tr("storage.emptyGuide")}
              </EmptyState>
            }
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
        </>
      ) : (
        <>
          <div className="cb-kit-page-actions cb-kit-spread">
            <button type="button" className="cb-kit-btn ghost" onClick={() => setBucket(undefined)}>
              ← {kit.tr("storage.buckets")}
            </button>
            <span className="mono">{bucket}</span>
            {isPg ? (
              <button type="button" className="cb-kit-btn ghost" onClick={() => setConfirmDeleteBucket(bucket)}>
                {kit.tr("storage.deleteBucket")}
              </button>
            ) : null}
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
              <div className="cb-kit-crumb cb-kit-spread">
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
                <input
                  ref={fileInputRef}
                  type="file"
                  className="cb-kit-file-input"
                  onChange={(e) => setSelectedFile(e.target.files?.[0])}
                />
                {selectedFile ? <span className="mono">{selectedFile.name}</span> : null}
                <button type="button" className="cb-kit-btn" disabled={!selectedFile || uploading} onClick={() => void uploadSelected()}>
                  {uploading ? kit.tr("common.loading") : kit.tr("storage.upload")}
                </button>
              </div>
              {hint ? <InlineMessage kind={hint.includes(kit.tr("storage.uploadFailed")) || hint.includes("失败") ? "err" : "ok"}>{hint}</InlineMessage> : null}
              <SimpleTable
                loading={files.loading}
                loadingLabel={kit.tr("table.loading")}
                columns={[kit.tr("fn.col.name"), kit.tr("storage.col.size"), kit.tr("fn.col.updated"), ""]}
                empty={kit.tr("common.empty")}
                rows={(files.data ?? []).map((file) => ({
                  key: file.cloudPath,
                  cells: [
                    file.isDirectory ? `📁 ${file.name}` : file.name,
                    file.sizeLabel ?? "—",
                    file.updatedAt ?? "—",
                    "",
                  ],
                  onClick: file.isDirectory
                    ? () => setPath(file.cloudPath.endsWith("/") ? file.cloudPath : `${file.cloudPath}/`)
                    : undefined,
                }))}
              />
              {(files.data ?? []).map((file) =>
                !file.isDirectory ? (
                  <div key={`link-${file.cloudPath}`} className="cb-kit-spread">
                    <span className="mono">{file.name}</span>
                    <button type="button" className="cb-kit-btn ghost" onClick={() => void openUrl(file)}>
                      {kit.tr("storage.link")}
                    </button>
                  </div>
                ) : null,
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
              <button type="button" className="cb-kit-btn" onClick={() => setConfirmSecurity(true)}>
                {kit.tr("storage.acl.edit")}
              </button>
            </div>
          ) : null}
          {tab === "cdn" ? (
            <SimpleTable
              columns={["Id", kit.tr("gateway.domainStatus")]}
              empty={kit.tr("common.empty")}
              rows={cdnRows.map((item) => ({
                key: item.id,
                cells: [item.id, item.status],
              }))}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmSecurity}
        title={kit.tr("storage.acl.edit")}
        body={kit.tr("storage.securityConfirm")}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={kit.tr("common.cancel")}
        onCancel={() => setConfirmSecurity(false)}
        onConfirm={() => {
          setConfirmSecurity(false);
          void provider
            ?.setStorageSecurityRules?.({ aclTag: acl, rule, bucket })
            .then(() => setHint(kit.tr("common.success")))
            .catch((error) => setHint(error instanceof Error ? error.message : String(error)));
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteBucket)}
        title={kit.tr("storage.deleteBucket")}
        body={confirmDeleteBucket ?? ""}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={kit.tr("common.cancel")}
        onCancel={() => setConfirmDeleteBucket(undefined)}
        onConfirm={() => {
          const name = confirmDeleteBucket;
          setConfirmDeleteBucket(undefined);
          if (!name || !provider?.deleteStorageBucket) return;
          void provider
            .deleteStorageBucket(name, true)
            .then(() => {
              setBucket(undefined);
              buckets.reload();
            })
            .catch((error) => setHint(error instanceof Error ? error.message : String(error)));
        }}
      />
    </div>
  );
}
