import { ENV_NAME } from "../constant";

export * from "./cloud-api-request";

export function getRuntime(): string {
  return process.env[ENV_NAME.ENV_RUNENV];
}

export function getEnvVar(envName: string): string {
  return process.env[envName];
}
