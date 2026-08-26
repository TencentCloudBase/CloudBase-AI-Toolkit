import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import type { LogSearchFilters } from "../core/types.js";
import { useAsyncResource } from "./use-platform.js";

export function useLogsSearch(
  provider: PlatformProvider | undefined,
  filters: LogSearchFilters,
  enabled = true,
): {
  data: ReturnType<typeof useAsyncResource<{ entries: import("../core/types.js").LogEntry[]; context?: string }>>["data"];
  error: string | undefined;
  loading: boolean;
  reload: () => void;
  loadMore: () => void;
  hasMore: boolean;
} {
  const [context, setContext] = React.useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = React.useState<import("../core/types.js").LogEntry[]>([]);
  const [nextContext, setNextContext] = React.useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const filterKey = JSON.stringify({ ...filters, context: undefined });

  React.useEffect(() => {
    setContext(undefined);
    setAccumulated([]);
    setNextContext(undefined);
  }, [filterKey]);

  const resource = useAsyncResource(
    async () => {
      if (!provider || !enabled) return { entries: [], context: undefined };
      const result = await provider.searchLogs({ ...filters, context });
      return result;
    },
    [provider, filterKey, context, enabled],
  );

  React.useEffect(() => {
    if (!resource.data) return;
    if (context) {
      setAccumulated((prev) => [...prev, ...resource.data!.entries]);
    } else {
      setAccumulated(resource.data.entries);
    }
    setNextContext(resource.data.context);
    setLoadingMore(false);
  }, [resource.data, context]);

  const loadMore = () => {
    if (!nextContext || loadingMore) return;
    setLoadingMore(true);
    setContext(nextContext);
    resource.reload();
  };

  return {
    data: { entries: accumulated, context: nextContext },
    error: resource.error,
    loading: resource.loading && !loadingMore,
    reload: () => {
      setContext(undefined);
      resource.reload();
    },
    loadMore,
    hasMore: Boolean(nextContext),
  };
}

export function useLogServiceCheck(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => {
      if (!provider?.checkLogService) return true;
      return provider.checkLogService();
    },
    [provider],
  );
}
