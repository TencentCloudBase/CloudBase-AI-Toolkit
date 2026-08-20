import type { PlatformProvider } from "../core/provider.js";
import { useAsyncResource } from "./use-platform.js";

export function useFunctions(
  provider: PlatformProvider | undefined,
  searchKey: string,
) {
  return useAsyncResource(
    () => (provider?.listFunctions ? provider.listFunctions({ searchKey }) : Promise.resolve([])),
    [provider, searchKey],
  );
}

export function useFunctionDetail(provider: PlatformProvider | undefined, name: string | undefined) {
  return useAsyncResource(
    () =>
      name && provider?.getFunction
        ? provider.getFunction(name)
        : Promise.resolve(undefined),
    [provider, name],
  );
}

export function useFunctionLogs(provider: PlatformProvider | undefined, name: string | undefined) {
  return useAsyncResource(
    () =>
      name && provider?.listFunctionLogs
        ? provider.listFunctionLogs(name)
        : Promise.resolve([]),
    [provider, name],
  );
}

export function useCloudRunServices(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider?.listCloudRunServices ? provider.listCloudRunServices() : Promise.resolve([])),
    [provider],
  );
}

export function useCloudRunDetail(provider: PlatformProvider | undefined, name: string | undefined) {
  return useAsyncResource(
    () =>
      name && provider?.getCloudRunService
        ? provider.getCloudRunService(name)
        : Promise.resolve(undefined),
    [provider, name],
  );
}

export function useCloudRunDeploys(provider: PlatformProvider | undefined, name: string | undefined) {
  return useAsyncResource(
    () =>
      name && provider?.listCloudRunDeploys
        ? provider.listCloudRunDeploys(name)
        : Promise.resolve([]),
    [provider, name],
  );
}

export function useCloudRunLogs(
  provider: PlatformProvider | undefined,
  name: string | undefined,
  kind: "process" | "build",
) {
  return useAsyncResource(
    () =>
      name && provider?.listCloudRunLogs
        ? provider.listCloudRunLogs(name, kind)
        : Promise.resolve({ lines: [] }),
    [provider, name, kind],
  );
}

export function useHostingOverview(provider?: PlatformProvider) {
  return useAsyncResource(
    () =>
      provider?.getHostingOverview
        ? provider.getHostingOverview()
        : Promise.resolve({ domains: [] }),
    [provider],
  );
}

export function useHostingVersions(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider?.listHostingVersions ? provider.listHostingVersions() : Promise.resolve([])),
    [provider],
  );
}

export function useHostingObjects(provider: PlatformProvider | undefined, prefix: string) {
  return useAsyncResource(
    () =>
      provider?.listHostingObjects
        ? provider.listHostingObjects(prefix)
        : provider
          ? provider.listStorage(prefix)
          : Promise.resolve([]),
    [provider, prefix],
  );
}

export function useStorageBuckets(provider?: PlatformProvider) {
  return useAsyncResource(
    () => (provider?.listStorageBuckets ? provider.listStorageBuckets() : Promise.resolve([])),
    [provider],
  );
}

export function useStorageObjects(
  provider: PlatformProvider | undefined,
  bucket: string | undefined,
  prefix: string,
) {
  return useAsyncResource(
    () => {
      if (!provider || !bucket) return Promise.resolve([]);
      if (provider.listStorageObjects) return provider.listStorageObjects(bucket, prefix);
      return provider.listStorage(prefix);
    },
    [provider, bucket, prefix],
  );
}

export function useStorageRules(provider?: PlatformProvider) {
  return useAsyncResource(
    () =>
      provider?.getStorageSecurityRules
        ? provider.getStorageSecurityRules()
        : Promise.resolve({ aclTag: "PRIVATE", rule: undefined as string | undefined }),
    [provider],
  );
}

export function useCdnCache(provider?: PlatformProvider) {
  return useAsyncResource(
    () =>
      provider?.listCdnCacheConfig
        ? provider.listCdnCacheConfig()
        : Promise.resolve({ status: "unknown" }),
    [provider],
  );
}

export function useBucketWriteSupport(provider?: PlatformProvider) {
  return useAsyncResource(
    () =>
      provider?.describeBucketWriteSupport
        ? provider.describeBucketWriteSupport()
        : Promise.resolve({
            supported: false as const,
            reason: "COS bucket create/delete is not exposed on the tcb control plane.",
          }),
    [provider],
  );
}
