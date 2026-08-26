import type { EnvFeatureContext } from "./types.js";

export enum EFeatureId {
  POSTGRES_ENV = "POSTGRES_ENV",
  NON_POSTGRES_ENV = "NON_POSTGRES_ENV",
  PG_DATABASE = "PG_DATABASE",
  MYSQL_DATABASE = "MYSQL_DATABASE",
  DOCUMENT_DATABASE = "DOCUMENT_DATABASE",
}

export function resolvePostgresEnv(ctx: EnvFeatureContext): boolean {
  if (ctx.isPostgresEnv !== undefined) return ctx.isPostgresEnv;
  const mode = (ctx.runtimeMode ?? "").toLowerCase();
  return mode.includes("postgres") || mode === "pg";
}

export function isFeatureAvailable(feature: EFeatureId, ctx: EnvFeatureContext): boolean {
  const isPg = resolvePostgresEnv(ctx);
  switch (feature) {
    case EFeatureId.POSTGRES_ENV:
      return isPg;
    case EFeatureId.NON_POSTGRES_ENV:
      return !isPg;
    case EFeatureId.PG_DATABASE:
      return isPg;
    case EFeatureId.MYSQL_DATABASE:
      return !isPg;
    case EFeatureId.DOCUMENT_DATABASE:
      return true;
    default:
      return true;
  }
}
