import * as React from "react";
import type { GatewayPrivilege, GatewayRouteInput } from "../core/types.js";
import type { PlatformProvider } from "../core/provider.js";
import { useAsyncResource } from "./use-platform.js";

export function useGatewayRoutes(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider ? provider.listGatewayRoutes() : []),
    [provider],
  );
}

export function useGatewayPrivilege(provider?: PlatformProvider) {
  return useAsyncResource<GatewayPrivilege>(
    async () => (provider ? provider.getGatewayPrivilege() : {}),
    [provider],
  );
}

export function useGatewayMutations(provider?: PlatformProvider) {
  const [pending, setPending] = React.useState(false);
  const wrap = React.useCallback(
    async (fn: () => Promise<void>) => {
      if (!provider) throw new Error("no provider");
      setPending(true);
      try {
        await fn();
      } finally {
        setPending(false);
      }
    },
    [provider],
  );
  return {
    pending,
    create: (input: GatewayRouteInput) => wrap(() => provider!.upsertGatewayRoute(input)),
    update: (input: GatewayRouteInput) => wrap(() => provider!.upsertGatewayRoute(input)),
    remove: (routeId: string) => wrap(() => provider!.deleteGatewayRoute(routeId, true)),
    toggleService: (enable: boolean) =>
      wrap(async () => {
        if (provider?.setGatewayServiceEnabled) await provider.setGatewayServiceEnabled(enable);
      }),
    toggleAuth: (enable: boolean) =>
      wrap(async () => {
        if (provider?.setGatewayAuthEnabled) await provider.setGatewayAuthEnabled(enable);
      }),
  };
}

export function useGatewayDomains(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => {
      if (provider?.listCustomDomains) return provider.listCustomDomains();
      if (provider?.listGatewayDomains) {
        return (await provider.listGatewayDomains()).map((domain) => ({
          domain,
          status: "ok",
          cnameTarget: undefined as string | undefined,
          certificateId: undefined as string | undefined,
        }));
      }
      return [];
    },
    [provider],
  );
}

export function useFunctionNames(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listFunctionNames ? provider.listFunctionNames() : []),
    [provider],
  );
}
