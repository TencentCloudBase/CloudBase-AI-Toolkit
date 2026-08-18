import * as React from "react";
import type { CloudBaseData, StorageObject } from "../../../shared/types.js";
import { appendUserMessage } from "../../lib/typert.js";
import { IconDownload, IconExternal, IconFile } from "../../lib/icons.js";

export function StorageTab(props: { data?: CloudBaseData }): React.ReactElement {
  const [files, setFiles] = React.useState<StorageObject[]>([]);
  const [path, setPath] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [hint, setHint] = React.useState<string | undefined>(undefined);

  const load = React.useCallback(async () => {
    if (!props.data) {
      setError("cloudbaseData 服务未注入。");
      return;
    }
    try {
      setFiles(await props.data.listStorage(path));
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [props.data, path]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openUrl = async (cloudPath: string) => {
    if (!props.data) return;
    try {
      const result = await props.data.storageUrl(cloudPath);
      if (result.url) window.open(result.url, "_blank");
      setHint("临时链接 1 小时后过期。私有桶请用临时链接，publicUrl 可能 403。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const upload = async () => {
    await appendUserMessage(
      props.data,
      `请调用 mcp__cloudbase__manageStorage action=upload，将用户选择的本地文件上传到云存储路径 ${path || "/"}。`,
    );
  };

  return (
    <div className="cb-dpanel">
      <div className="cb-db-toolbar">
        <strong>{path || "/"}</strong>
        <span className="cb-spacer" />
        <button className="cb-mini" type="button" onClick={() => void upload()}>
          <IconDownload />
          上传
        </button>
      </div>
      {error ? <div className="cb-error">{error}</div> : null}
      {hint ? <div className="cb-hint" style={{ padding: "6px 12px" }}>{hint}</div> : null}
      <div className="cb-tbl-wrap">
        <table className="cb-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>大小</th>
              <th>修改时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.cloudPath}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconFile />
                    {file.isDirectory ? (
                      <button className="cb-link" type="button" onClick={() => setPath(file.cloudPath)}>
                        {file.name}
                      </button>
                    ) : (
                      file.name
                    )}
                  </span>
                </td>
                <td>{file.sizeLabel}</td>
                <td>{file.updatedAt ?? "—"}</td>
                <td>
                  {!file.isDirectory ? (
                    <button className="cb-mini" type="button" onClick={() => void openUrl(file.cloudPath)}>
                      <IconExternal />
                      链接
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cb-tfoot">
        <span>
          {files.length} 个对象 · 路径 {path || "/"}
        </span>
      </div>
    </div>
  );
}
