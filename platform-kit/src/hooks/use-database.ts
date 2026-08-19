import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import { useAsyncResource } from "./use-platform.js";

export function useTableSchema(
  provider: PlatformProvider | undefined,
  schemaTable: string | undefined,
) {
  return useAsyncResource(
    async () => {
      if (!provider || !schemaTable) throw new Error("no table");
      return provider.getTableSchema(schemaTable);
    },
    [provider, schemaTable],
  );
}

export function useSchemaPolicies(provider: PlatformProvider | undefined, schema = "public") {
  return useAsyncResource(
    async () => {
      if (!provider) return [];
      return provider.listSchemaPolicies(schema);
    },
    [provider, schema],
  );
}

export function usePgMutation(provider?: PlatformProvider) {
  const [pending, setPending] = React.useState(false);
  const execute = React.useCallback(
    async (sql: string) => {
      if (!provider) throw new Error("no provider");
      setPending(true);
      try {
        const result = await provider.runPgDDL(sql, true);
        if (!result.ok) throw new Error(result.message);
      } finally {
        setPending(false);
      }
    },
    [provider],
  );
  return { execute, pending };
}

export function usePgFunctions(provider?: PlatformProvider, schema = "public") {
  return useAsyncResource(
    async () => (provider?.listPgFunctions ? provider.listPgFunctions(schema) : []),
    [provider, schema],
  );
}

export function usePgExtensions(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listPgExtensions ? provider.listPgExtensions() : []),
    [provider],
  );
}

export function usePgRoles(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listPgRoles ? provider.listPgRoles() : []),
    [provider],
  );
}

export function usePgMigrations(provider?: PlatformProvider) {
  return useAsyncResource(
    async () => (provider?.listMigrations ? provider.listMigrations() : provider?.listPgMigrations ? provider.listPgMigrations() : []),
    [provider],
  );
}
