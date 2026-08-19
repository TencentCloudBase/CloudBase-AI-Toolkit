import * as React from "react";
import type { EnvFeatureContext } from "../core/types.js";
import { EFeatureId, isFeatureAvailable } from "../core/features.js";

export function useFeatureAvailable(feature: EFeatureId, ctx: EnvFeatureContext): boolean {
  return React.useMemo(() => isFeatureAvailable(feature, ctx), [feature, ctx.isPostgresEnv, ctx.runtimeMode]);
}

export function useEnvFeatures(ctx: EnvFeatureContext) {
  return React.useMemo(
    () => ({
      isPostgres: isFeatureAvailable(EFeatureId.POSTGRES_ENV, ctx),
      isNonPostgres: isFeatureAvailable(EFeatureId.NON_POSTGRES_ENV, ctx),
    }),
    [ctx.isPostgresEnv, ctx.runtimeMode],
  );
}
