/**
 * CloudBase-specific tool category type.
 *
 * Every category value currently used across mcp/src/tools/**/*.ts is listed
 * here so that tool definitions can be type-checked without resorting to `any`.
 */

export type ToolCategory =
  | "agents"
  | "apps"
  | "auth"
  | "cloud-api"
  | "cloudrun"
  | "database"
  | "download"
  | "env"
  | "functions"
  | "gateway"
  | "hosting"
  | "invite-code"
  | "logs"
  | "NoSQL database"
  | "permissions"
  | "rag"
  | "setup"
  | "SQL database"
  | "storage"
  | "web";
