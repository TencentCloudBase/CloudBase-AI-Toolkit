import * as React from "react";
import type { CloudBaseData } from "../../../shared/types.js";
import {
  IconBrowser,
  IconExternal,
  IconOpen,
  IconRefresh,
} from "../../lib/icons.js";
import {
  UrlPreview as KitUrlPreview,
  useAccessEndpoints,
  createTranslator,
} from "@cloudbase/platform-kit";

export interface PreviewTabProps {
  seedUrl?: string;
  data?: CloudBaseData;
}

export function PreviewTab(props: PreviewTabProps): React.ReactElement {
  const endpoints = useAccessEndpoints(props.data as never);
  const tr = createTranslator("zh");

  return (
    <KitUrlPreview
      seedUrl={props.seedUrl}
      endpoints={endpoints.data ?? []}
      endpointsLoading={endpoints.loading}
      loadEndpoints={endpoints.reload}
      placeholder={tr("preview.placeholder")}
      selectLabel={tr("preview.selectUrl")}
      loadLabel={tr("preview.load")}
      recentLabel={tr("preview.recent")}
      openLabel={tr("common.open")}
      refreshLabel={tr("common.refresh")}
      renderIconBrowser={() => <IconBrowser />}
      renderIconOpen={() => <IconOpen />}
      renderIconRefresh={() => <IconRefresh />}
      renderIconExternal={() => <IconExternal />}
    />
  );
}
