import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import type { AppUser } from "../core/types.js";
import { useAsyncResource } from "./use-platform.js";

export function useAuthUsers(
  provider?: PlatformProvider,
  opts?: { pageSize?: number; pageNo?: number; keyword?: string },
) {
  return useAsyncResource(
    async () => {
      if (!provider) return { users: [] as AppUser[], total: 0 };
      const result = await provider.searchAppUsers({
        pageSize: opts?.pageSize ?? 20,
        pageNo: opts?.pageNo ?? 1,
        keyword: opts?.keyword,
      });
      return { users: result.users, total: result.total ?? result.users.length };
    },
    [provider, opts?.pageSize, opts?.pageNo, opts?.keyword],
  );
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
