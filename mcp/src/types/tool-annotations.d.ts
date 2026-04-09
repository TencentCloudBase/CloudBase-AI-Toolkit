/**
 * Type augmentation for @modelcontextprotocol/sdk
 *
 * The MCP SDK's official ToolAnnotations type only defines four boolean hint
 * fields (readOnlyHint, destructiveHint, idempotentHint, openWorldHint).
 * CloudBase extends annotations with a custom `category` string to group tools
 * for display, filtering and telemetry.
 *
 * This module augmentation makes `category` visible to TypeScript so that tool
 * definitions are type-checked without resorting to `any`.
 */

import type { ToolCategory } from "./tool-category.js";

declare module "@modelcontextprotocol/sdk/types.js" {
  interface ToolAnnotations {
    /** CloudBase-specific tool category for grouping / filtering / telemetry. */
    category?: ToolCategory;
  }
}
