import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";

export function useAsyncResource<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
): { data: T | undefined; error: string | undefined; loading: boolean; reload: () => void } {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loader()
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setError(undefined);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return {
    data,
    error,
    loading,
    reload: () => setTick((value) => value + 1),
  };
}

export function useAccessEndpoints(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.listAccessEndpoints() : Promise.resolve([])),
    [provider],
  );
}

export function useDeployments(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.listDeployments() : Promise.resolve([])),
    [provider],
  );
}

export function useEnvInfo(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.envInfo() : Promise.reject(new Error("no provider"))),
    [provider],
  );
}

export function useMetrics(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.metrics() : Promise.resolve([])),
    [provider],
  );
}

export function useUsage(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.usage() : Promise.resolve([])),
    [provider],
  );
}

export function useTables(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.listTables() : Promise.resolve([])),
    [provider],
  );
}

export function useRecentLogs(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.recentErrors() : Promise.resolve([])),
    [provider],
  );
}
