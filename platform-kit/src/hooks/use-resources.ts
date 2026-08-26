import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import { useAsyncResource } from "./use-platform.js";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useFunctions(provider?: PlatformProvider, searchKey?: string) {
  return useAsyncResource(
    async () => (provider?.listFunctions ? provider.listFunctions({ searchKey, limit: 100 }) : []),
    [provider, searchKey],
  );
}

export function useFunctionDetail(provider?: PlatformProvider, name?: string) {
  return useAsyncResource(
    async () => {
      if (!provider?.getFunction || !name) return undefined;
      return provider.getFunction(name);
    },
    [provider, name],
  );
}

export function useFunctionLogs(provider?: PlatformProvider, name?: string) {
  return useAsyncResource(
    async () => {
      if (!provider?.listFunctionLogs || !name) return [];
      return provider.listFunctionLogs(name, { limit: 20 });
    },
    [provider, name],
  );
}

export function useCloudRunServices(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listCloudRunServices ? provider.listCloudRunServices() : []),
    [provider],
  );
}

export function useCloudRunDetail(provider?: PlatformProvider, name?: string) {
  return useAsyncResource(
    async () => {
      if (!provider?.getCloudRunService || !name) return undefined;
      return provider.getCloudRunService(name);
    },
    [provider, name],
  );
}

export function useCloudRunDeploys(provider?: PlatformProvider, name?: string) {
  return useAsyncResource(
    async () => {
      if (!provider?.listCloudRunDeployRecords || !name) return [];
      return provider.listCloudRunDeployRecords(name);
    },
    [provider, name],
  );
}

export function useCloudRunLogs(provider?: PlatformProvider, name?: string, runId?: string) {
  return useAsyncResource(
    async () => {
      if (!provider?.getCloudRunProcessLog || !name) return [];
      return provider.getCloudRunProcessLog(name, runId);
    },
    [provider, name, runId],
  );
}

export function useHostingDomains(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listHostingDomains ? provider.listHostingDomains() : []),
    [provider],
  );
}

export function useHostingVersions(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listHostingVersions ? provider.listHostingVersions() : []),
    [provider],
  );
}

export function useHostingObjects(provider?: PlatformProvider, prefix?: string) {
  return useAsyncResource(
    async () => {
      if (!provider?.listHostingObjects) {
        throw new Error("当前环境无法列出托管文件");
      }
      return provider.listHostingObjects(prefix);
    },
    [provider, prefix],
  );
}

export function useStorageBuckets(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listStorageBuckets ? provider.listStorageBuckets() : []),
    [provider],
  );
}

export function useStorageObjects(provider?: PlatformProvider, path?: string, bucket?: string) {
  return useAsyncResource(
    async () => (provider ? provider.listStorage(path, bucket ? { bucket } : undefined) : []),
    [provider, path, bucket],
  );
}
