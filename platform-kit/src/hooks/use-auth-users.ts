import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import { useAsyncResource } from "./use-platform.js";

export function useAuthUsers(provider?: PlatformProvider, opts?: { pageSize?: number }) {
  return useAsyncResource(
    async () => {
      if (!provider) return [];
      const result = await provider.searchAppUsers({ pageSize: opts?.pageSize ?? 100 });
      return result.users;
    },
    [provider, opts?.pageSize],
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
