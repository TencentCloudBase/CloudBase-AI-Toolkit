import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import type { StorageObject } from "../../core/types.js";
import { useKit } from "../../hooks/use-menu.js";
import { resolvePostgresEnv } from "../../core/features.js";
import { useStorageBuckets, useStorageObjects } from "../../hooks/use-resources.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import {
  DegradeNote,
  EmptyState,
  ErrorBanner,
  FeedbackBanner,
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
  const pgEnv = kit.featureCtx.isPostgresEnv ?? resolvePostgresEnv(kit.featureCtx);
  const buckets = useStorageBuckets(provider);
  const [bucket, setBucket] = React.useState<string | undefined>(undefined);
  const [path, setPath] = React.useState("");
  const files = useStorageObjects(provider, path, bucket);
  const [tab, setTab] = React.useState("files");
  const [acl, setAcl] = React.useState("");
  const [rule, setRule] = React.useState("");
  const [cdnRows, setCdnRows] = React.useState<Array<{ id: string; status: string }>>([]);
  const [hint, setHint] = React.useState<string | undefined>(undefined);
  const [selectedFile, setSelectedFile] = React.useState<File | undefined>(undefined);
  const [uploading, setUploading] = React.useState(false);
  const [newBucketName, setNewBucketName] = React.useState("");
  const [confirmCreate, setConfirmCreate] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | undefined>(undefined);
  const [confirmAcl, setConfirmAcl] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ kind: "ok" | "error"; text: string } | undefined>(
    undefined,
  );
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
    setHint("临时链接会过期。");
  };

  const uploadSelected = async () => {
    if (!provider?.uploadStorage || !selectedFile) return;
    setUploading(true);
    setFeedback(undefined);
    try {
      const targetPath = path
        ? path.endsWith("/")
          ? `${path}${selectedFile.name}`
          : `${path}/${selectedFile.name}`
        : selectedFile.name;
      await provider.uploadStorage(selectedFile, targetPath, bucket ? { bucket } : undefined);
      setFeedback({ kind: "ok", text: kit.tr("storage.upload.success") });
      setSelectedFile(undefined);
      files.reload();
    } catch (err) {
      setFeedback({ kind: "error", text: `${kit.tr("storage.upload.fail")}: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setUploading(false);
    }
  };

  const createBucket = async () => {
    if (!provider?.createStorageBucket || !newBucketName.trim()) return;
    try {
      await provider.createStorageBucket(newBucketName.trim());
      setNewBucketName("");
      setConfirmCreate(false);
      buckets.reload();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const deleteBucket = async (name: string) => {
    if (!provider?.deleteStorageBucket) return;
    try {
      await provider.deleteStorageBucket(name, true);
      setConfirmDelete(undefined);
      if (bucket === name) setBucket(undefined);
      buckets.reload();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="cb-kit-page" data-testid="cb-page-storage">
      <PageHead title={kit.tr("storage.title")} onRefresh={() => buckets.reload()} refreshLabel={kit.tr("common.refresh")}>
        {!bucket && pgEnv && provider?.createStorageBucket ? (
          <>
            <input
              className="cb-kit-input"
              data-testid="cb-storage-bucket-name"
              placeholder={kit.tr("storage.createBucket")}
              value={newBucketName}
              onChange={(e) => setNewBucketName(e.target.value)}
            />
            <button type="button" className="cb-kit-btn" data-testid="cb-storage-bucket-create" disabled={!newBucketName.trim()} onClick={() => setConfirmCreate(true)}>
              {kit.tr("storage.createBucket")}
            </button>
          </>
        ) : null}
      </PageHead>
      <ErrorBanner error={buckets.error} retry={() => buckets.reload()} retryLabel={kit.tr("common.retry")} />
      {feedback ? <FeedbackBanner kind={feedback.kind === "ok" ? "ok" : "error"}>{feedback.text}</FeedbackBanner> : null}
      {!pgEnv ? <DegradeNote>{kit.tr("storage.bucketCreateUnsupported")}</DegradeNote> : null}

      {!bucket ? (
        <SimpleTable
          loading={buckets.loading}
          columns={[
            kit.tr("storage.buckets"),
            kit.tr("storage.col.region"),
            kit.tr("storage.col.cdn"),
            kit.tr("storage.col.kind"),
          ]}
          empty={
            pgEnv && provider?.createStorageBucket ? (
              <span>
                {kit.tr("storage.empty")}
                <div className="cb-kit-empty-action">
                  <button type="button" className="cb-kit-btn" onClick={() => setConfirmCreate(true)}>
                    {kit.tr("storage.createBucket")}
                  </button>
                </div>
              </span>
            ) : (
              kit.tr("storage.empty")
            )
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
      ) : (
        <>
          <div className="cb-kit-spread">
            <button type="button" className="cb-kit-btn ghost" onClick={() => setBucket(undefined)}>
              ← {kit.tr("storage.buckets")}
            </button>
            <span className="mono">{bucket}</span>
            {pgEnv && provider?.deleteStorageBucket ? (
              <button type="button" className="cb-kit-btn ghost danger" onClick={() => setConfirmDelete(bucket)}>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={(e) => setSelectedFile(e.target.files?.[0])}
                />
                <button type="button" className="cb-kit-btn ghost" onClick={() => fileInputRef.current?.click()}>
                  {kit.tr("storage.upload")}
                </button>
                {selectedFile ? (
                  <span className="mono">
                    {kit.tr("storage.upload.selected")}: {selectedFile.name}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="cb-kit-btn"
                  disabled={!selectedFile || uploading || !provider?.uploadStorage}
                  onClick={() => void uploadSelected()}
                >
                  {uploading ? kit.tr("common.loading") : kit.tr("storage.upload")}
                </button>
              </div>
              {hint ? <div className="cb-kit-banner warn">{hint}</div> : null}
              {!provider?.uploadStorage ? (
                <DegradeNote>上传需宿主实现 uploadStorage（COS）。</DegradeNote>
              ) : null}
              {(files.data ?? []).length === 0 && !files.loading ? (
                <EmptyState>{kit.tr("common.empty")}</EmptyState>
              ) : (
                <div className="cb-kit-card cb-kit-table">
                  <div className="cb-kit-table-head cols-4">
                    <span>{kit.tr("fn.col.name")}</span>
                    <span>{kit.tr("storage.col.size")}</span>
                    <span>{kit.tr("fn.col.updated")}</span>
                    <span />
                  </div>
                  {(files.data ?? []).map((file) => (
                    <div key={file.cloudPath} className="cb-kit-table-row static cols-4" role="row">
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
              <button type="button" className="cb-kit-btn" onClick={() => setConfirmAcl(true)}>
                {kit.tr("storage.acl.edit")}
              </button>
            </div>
          ) : null}
          {tab === "cdn" ? (
            <SimpleTable
              columns={["Id", kit.tr("gateway.domains.status")]}
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
        open={confirmCreate}
        title={kit.tr("storage.createBucket")}
        body={kit.tr("storage.createBucketConfirm")}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={kit.tr("common.cancel")}
        onCancel={() => setConfirmCreate(false)}
        onConfirm={() => void createBucket()}
      />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={kit.tr("storage.deleteBucket")}
        body={kit.tr("storage.deleteBucketConfirm")}
        confirmLabel={kit.tr("common.delete")}
        cancelLabel={kit.tr("common.cancel")}
        danger
        onCancel={() => setConfirmDelete(undefined)}
        onConfirm={() => confirmDelete && void deleteBucket(confirmDelete)}
      />
      <ConfirmDialog
        open={confirmAcl}
        title={kit.tr("storage.acl.edit")}
        body={kit.tr("storage.acl.saveConfirm")}
        confirmLabel={kit.tr("common.save")}
        cancelLabel={kit.tr("common.cancel")}
        onCancel={() => setConfirmAcl(false)}
        onConfirm={() => {
          void (async () => {
            try {
              await provider?.setStorageSecurityRules?.({ aclTag: acl, rule, bucket });
              setFeedback({ kind: "ok", text: kit.tr("storage.acl.saved") });
            } catch (err) {
              setFeedback({ kind: "error", text: kit.tr("storage.acl.failed") });
            } finally {
              setConfirmAcl(false);
            }
          })();
        }}
      />
    </div>
  );
}
