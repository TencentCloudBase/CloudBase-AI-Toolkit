import * as React from "react";
import type { PlatformProvider } from "../provider.js";

export function useAsyncResource<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
): { data: T | undefined; error: string | undefined; reload: () => void } {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void loader()
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setError(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, error, reload: () => setTick((value) => value + 1) };
}

export function useTables(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.listTables() : Promise.resolve([])),
    [provider],
  );
}

export function useAppUsers(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.listAppUsers({ limit: 50 }) : Promise.resolve([])),
    [provider],
  );
}

export function useSecrets(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider ? provider.listSecrets() : Promise.resolve([])),
    [provider],
  );
}
