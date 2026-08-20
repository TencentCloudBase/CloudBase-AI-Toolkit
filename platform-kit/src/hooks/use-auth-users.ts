import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import { useAsyncResource } from "./use-platform.js";

export function useAuthUsers(provider?: PlatformProvider, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? 20;
  const [pageNo, setPageNo] = React.useState(1);
  const resource = useAsyncResource(
    async () => {
      if (!provider) return { users: [], total: 0 };
      const result = await provider.searchAppUsers({ pageNo, pageSize });
      return { users: result.users, total: result.total ?? result.users.length };
    },
    [provider, pageNo, pageSize],
  );
  return {
    users: resource.data?.users ?? [],
    total: resource.data?.total ?? 0,
    pageNo,
    setPageNo,
    pageSize,
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
  };
}

export function useSetUserStatus(provider?: PlatformProvider) {
  const [pendingUid, setPendingUid] = React.useState<string | undefined>(undefined);
  const mutate = React.useCallback(
    async (uid: string, enabled: boolean) => {
      if (!provider) throw new Error("no provider");
      setPendingUid(uid);
      try {
        await provider.setAppUserStatus(uid, enabled);
      } finally {
        setPendingUid(undefined);
      }
    },
    [provider],
  );
  return { mutate, pendingUid };
}
