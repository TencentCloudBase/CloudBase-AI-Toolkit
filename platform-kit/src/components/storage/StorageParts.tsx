import * as React from "react";
import type { StorageBucket, StorageObject } from "../../core/types.js";
import { KitTable } from "../KitTable.js";

export function StorageBucketTable(props: {
  buckets: StorageBucket[];
  empty: string;
  columns: string[];
  onSelect: (name: string) => void;
}): React.ReactElement {
  return (
    <KitTable
      colsClass="cols-4"
      columns={props.columns}
      empty={props.empty}
      rows={props.buckets.map((bucket) => ({
        key: bucket.name,
        onClick: () => props.onSelect(bucket.name),
        cells: [
          <span className="mono" key="n">{bucket.name}</span>,
          bucket.region ?? "—",
          bucket.createdAt ?? "—",
          bucket.sizeLabel ?? "—",
        ],
      }))}
    />
  );
}

export function StorageFileBrowser(props: {
  files: StorageObject[];
  prefix: string;
  empty: string;
  uploadHint: string;
  onOpenDir: (path: string) => void;
  onOpenUrl?: (cloudPath: string) => void;
  onUpload?: () => void;
}): React.ReactElement {
  const crumbs = React.useMemo(() => {
    const parts = props.prefix.split("/").filter(Boolean);
    const items = [{ label: "/", path: "" }];
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      items.push({ label: part, path: acc });
    }
    return items;
  }, [props.prefix]);

  return (
    <div>
      <div className="cb-kit-crumbs">
        {crumbs.map((crumb) => (
          <button key={crumb.path || "root"} type="button" onClick={() => props.onOpenDir(crumb.path)}>
            {crumb.label}
          </button>
        ))}
        {props.onUpload ? (
          <button type="button" className="cb-kit-btn ghost" onClick={props.onUpload}>
            Upload
          </button>
        ) : null}
      </div>
      <div className="cb-kit-banner warn">{props.uploadHint}</div>
      <KitTable
        colsClass="cols-4"
        columns={["Name", "Size", "Updated", ""]}
        empty={props.empty}
        rows={props.files.map((file) => ({
          key: file.cloudPath,
          onClick: file.isDirectory ? () => props.onOpenDir(file.cloudPath) : undefined,
          cells: [
            file.name,
            file.sizeLabel,
            file.updatedAt ?? "—",
            !file.isDirectory && props.onOpenUrl ? (
              <button
                key="url"
                type="button"
                className="cb-kit-btn ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onOpenUrl?.(file.cloudPath);
                }}
              >
                URL
              </button>
            ) : (
              ""
            ),
          ],
        }))}
      />
    </div>
  );
}

export function StorageRulesPanel(props: {
  aclTag: string;
  rule?: string;
  saveLabel: string;
  onSave?: (aclTag: string, rule?: string) => void;
}): React.ReactElement {
  const [aclTag, setAclTag] = React.useState(props.aclTag);
  const [rule, setRule] = React.useState(props.rule ?? "");
  React.useEffect(() => {
    setAclTag(props.aclTag);
    setRule(props.rule ?? "");
  }, [props.aclTag, props.rule]);
  return (
    <div className="cb-kit-card" style={{ padding: 12 }}>
      <div className="cb-kit-field">
        <span>AclTag</span>
        <input className="cb-kit-input" value={aclTag} onChange={(e) => setAclTag(e.target.value)} />
      </div>
      <div className="cb-kit-field">
        <span>Rule</span>
        <textarea className="cb-kit-textarea" rows={6} value={rule} onChange={(e) => setRule(e.target.value)} />
      </div>
      {props.onSave ? (
        <button type="button" className="cb-kit-btn" onClick={() => props.onSave?.(aclTag, rule || undefined)}>
          {props.saveLabel}
        </button>
      ) : null}
    </div>
  );
}
