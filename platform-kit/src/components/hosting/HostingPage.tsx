import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import { useHostingObjects, useHostingOverview, useHostingVersions } from "../../hooks/use-resources.js";
import { HostingDomains, HostingFileBrowser, HostingVersions } from "./HostingParts.js";

export interface HostingPageProps {
  provider?: PlatformProvider;
}

export function HostingPage(props: HostingPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const overview = useHostingOverview(provider);
  const versions = useHostingVersions(provider);
  const [prefix, setPrefix] = React.useState("");
  const files = useHostingObjects(provider, prefix);

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("hosting.title")}</h2>
        <div className="cb-kit-page-actions">
          <button
            type="button"
            className="cb-kit-btn ghost"
            onClick={() => {
              overview.reload();
              versions.reload();
              files.reload();
            }}
          >
            {kit.tr("common.refresh")}
          </button>
        </div>
      </div>
      {overview.error ? (
        <div style={{ color: "var(--cb-danger)", marginBottom: 8 }}>{overview.error}</div>
      ) : null}
      {overview.loading ? <div className="cb-kit-restricted">{kit.tr("common.loading")}</div> : null}
      {!overview.loading ? (
        <HostingDomains
          info={overview.data ?? { domains: [] }}
          empty={kit.tr("hosting.empty")}
          title={kit.tr("hosting.domains")}
        />
      ) : null}
      <HostingFileBrowser
        files={files.data ?? []}
        prefix={prefix}
        empty={kit.tr("common.empty")}
        hint={kit.tr("hosting.cosHint")}
        onOpenDir={setPrefix}
      />
      <HostingVersions
        records={versions.data ?? []}
        empty={kit.tr("common.empty")}
        title={kit.tr("hosting.versions")}
      />
    </div>
  );
}
