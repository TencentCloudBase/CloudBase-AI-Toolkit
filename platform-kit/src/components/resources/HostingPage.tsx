import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import { useHostingDomains, useHostingObjects, useHostingVersions } from "../../hooks/use-resources.js";
import { EmptyState, ErrorBanner, PageHead, SimpleTable } from "./ResourceParts.js";

export interface HostingPageProps {
  provider?: PlatformProvider;
}

export function HostingPage(props: HostingPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const domains = useHostingDomains(provider);
  const versions = useHostingVersions(provider);
  const [prefix, setPrefix] = React.useState("");
  const files = useHostingObjects(provider, prefix);
  const crumbs = prefix.split("/").filter(Boolean);

  return (
    <div className="cb-kit-page">
      <PageHead
        title={kit.tr("hosting.title")}
        onRefresh={() => {
          domains.reload();
          versions.reload();
          files.reload();
        }}
        refreshLabel={kit.tr("common.refresh")}
      />
      <ErrorBanner error={domains.error} retry={() => domains.reload()} retryLabel={kit.tr("common.retry")} />

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("hosting.domains")}</div>
        {(domains.data ?? []).length === 0 ? (
          <EmptyState>{kit.tr("hosting.emptyGuide")}</EmptyState>
        ) : (
          <div className="cb-kit-card">
            {(domains.data ?? []).map((item) => (
              <div key={item.domain} className="cb-kit-endpoint">
                <span className="tag">{item.kind ?? "hosting"}</span>
                <span className="url">{item.domain}</span>
                <span className="mono">{item.status ?? ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("hosting.files")}</div>
        <ErrorBanner error={files.error} retry={() => files.reload()} retryLabel={kit.tr("common.retry")} />
        <div className="cb-kit-crumb">
          <button type="button" onClick={() => setPrefix("")}>
            /
          </button>
          {crumbs.map((part, index) => (
            <span key={`${part}-${index}`}>
              <span> / </span>
              <button type="button" onClick={() => setPrefix(crumbs.slice(0, index + 1).join("/") + "/")}>
                {part}
              </button>
            </span>
          ))}
        </div>
        <SimpleTable
          columns={[kit.tr("fn.col.name"), kit.tr("hosting.col.size"), kit.tr("fn.col.updated"), kit.tr("hosting.col.type")]}
          empty={kit.tr("common.empty")}
          rows={(files.data ?? []).map((item) => ({
            key: item.cloudPath,
            cells: [
              item.name,
              item.sizeLabel,
              item.updatedAt ?? "—",
              item.isDirectory ? "dir" : "file",
            ],
            onClick: item.isDirectory ? () => setPrefix(item.cloudPath.endsWith("/") ? item.cloudPath : `${item.cloudPath}/`) : undefined,
          }))}
        />
      </div>

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("hosting.versions")}</div>
        <SimpleTable
          columns={["Service", "Version", "Status", "Time"]}
          empty={kit.tr("common.empty")}
          rows={(versions.data ?? []).map((item) => ({
            key: `${item.serviceName}:${item.versionName}`,
            cells: [item.serviceName, item.versionName, item.status ?? "—", item.deployedAt ?? "—"],
          }))}
        />
      </div>
    </div>
  );
}
