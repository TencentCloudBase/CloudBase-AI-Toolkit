/**
 * Resolve undici even when not yet linked at node_modules/undici
 * (pnpm store already pins undici@6.28.0 via overrides).
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export async function loadUndici() {
  try {
    return await import("undici");
  } catch {
    // Fall back to workspace pnpm store copy
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const candidate = join(
      root,
      "node_modules/.pnpm/undici@6.28.0/node_modules/undici/index.js",
    );
    if (existsSync(candidate)) {
      return import(candidate);
    }
    // Last resort: require.resolve walking
    try {
      const resolved = require.resolve("undici");
      return import(resolved);
    } catch (err) {
      throw new Error(
        `undici is required for MCP_E2E_TLS_INSECURE. Install undici@6.28.0. (${err.message})`,
      );
    }
  }
}
