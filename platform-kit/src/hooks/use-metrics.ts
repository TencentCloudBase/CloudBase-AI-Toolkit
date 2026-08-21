import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import type { MetricSeries } from "../core/types.js";
import { useAsyncResource } from "./use-platform.js";

const DEFAULT_METRICS = [
  "FunctionInvocation",
  "DbRead",
  "DbWrite",
  "FunctionError",
] as const;

export function useMetricCards(
  provider?: PlatformProvider,
  names: readonly string[] = DEFAULT_METRICS,
) {
  return useAsyncResource(
    async (): Promise<MetricSeries[]> => {
      if (!provider) return [];
      const results = await Promise.all(
        names.map(async (name) => {
          try {
            return await provider.fetchMetricSeries(name);
          } catch {
            return {
              name,
              label: name,
              valueLabel: "—",
              points: [],
              danger: name === "FunctionError",
            } satisfies MetricSeries;
          }
        }),
      );
      return results;
    },
    [provider, names.join(",")],
  );
}
