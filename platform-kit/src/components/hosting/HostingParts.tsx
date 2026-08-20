import * as React from "react";
import type { DeploymentRecord, HostingInfo, StorageObject } from "../../core/types.js";
import { KitTable } from "../KitTable.js";

export function HostingDomains(props: { info: HostingInfo; empty: string; title: string }): React.ReactElement {
  const items = props.info.domains.filter((d) => d.domain);
  const fallback: HostingInfo["domains"] = props.info.defaultUrl
    ? [{ domain: props.info.defaultUrl, status: "default" }]
    : [];
  const domains = items.length > 0 ? items : fallback;
  if (domains.length === 0) {
    return <div className="cb-kit-restricted">{props.empty}</div>;
  }
  return (
    <div className="cb-kit-section">
      <div className="cb-kit-section-h">{props.title}</div>
      <div className="cb-kit-card">
        {domains.map((item) => (
          <div key={item.domain} className="cb-kit-endpoint">
            <span className="tag">{item.status ?? "hosting"}</span>
            <span className="url">{item.domain}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HostingFileBrowser(props: {
  files: StorageObject[];
  prefix: string;
  empty: string;
  hint: string;
  onOpenDir: (path: string) => void;
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
    <div className="cb-kit-section">
      <div className="cb-kit-crumbs">
        {crumbs.map((crumb) => (
          <button key={crumb.path || "root"} type="button" onClick={() => props.onOpenDir(crumb.path)}>
            {crumb.label}
          </button>
        ))}
      </div>
      <div className="cb-kit-banner warn">{props.hint}</div>
      <KitTable
        colsClass="cols-4"
        columns={["Name", "Size", "Updated", "Type"]}
        empty={props.empty}
        rows={props.files.map((file) => ({
          key: file.cloudPath,
          onClick: file.isDirectory ? () => props.onOpenDir(file.cloudPath) : undefined,
          cells: [
            file.name,
            file.sizeLabel,
            file.updatedAt ?? "—",
            file.isDirectory ? "dir" : "file",
          ],
        }))}
      />
    </div>
  );
}

export function HostingVersions(props: {
  records: DeploymentRecord[];
  empty: string;
  title: string;
}): React.ReactElement {
  return (
    <div className="cb-kit-section">
      <div className="cb-kit-section-h">{props.title}</div>
      <KitTable
        colsClass="cols-4"
        columns={["Resource", "Version", "Status", "Time"]}
        empty={props.empty}
        rows={props.records.map((item) => ({
          key: item.id,
          cells: [item.resourceName, item.versionName ?? "—", item.status, item.deployedAt ?? "—"],
        }))}
      />
    </div>
  );
}
