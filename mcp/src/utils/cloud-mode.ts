/**
 * Check if MCP is running in cloud mode
 * Cloud mode is enabled by:
 * 1. Command line argument --cloud-mode
 * 2. Environment variable CLOUDBASE_MCP_CLOUD_MODE=true
 * 3. Environment variable MCP_CLOUD_MODE=true
 *
 * Intentionally does not import logger: logger.ts calls isCloudMode() during
 * module init, so importing logger here creates a circular dependency that
 * crashes `node dist/cli.cjs --cloud-mode` with `debug is not a function`.
 */
export function isCloudMode(): boolean {
  // Check for CLI argument first
  const hasCloudModeArg = process.argv.includes('--cloud-mode');

  // Check environment variables
  const cloudModeEnabled = process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true' ||
                          process.env.MCP_CLOUD_MODE === 'true';

  return hasCloudModeArg || cloudModeEnabled;
}

/**
 * Enable cloud mode by setting environment variable
 */
export function enableCloudMode(): void {
  process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
}

/**
 * Get cloud mode status for logging/debugging
 */
export function getCloudModeStatus(): {
  enabled: boolean;
  source: string | null;
} {
  // Check CLI argument first
  if (process.argv.includes('--cloud-mode')) {
    return { enabled: true, source: 'CLI_ARG' };
  }

  if (process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true') {
    return { enabled: true, source: 'CLOUDBASE_MCP_CLOUD_MODE' };
  }
  if (process.env.MCP_CLOUD_MODE === 'true') {
    return { enabled: true, source: 'MCP_CLOUD_MODE' };
  }
  return { enabled: false, source: null };
}

/**
 * Tools that are incompatible with cloud mode because they read from or write to
 * the local filesystem (uploads, downloads, config files, or building an upload
 * artifact from `process.cwd()`). In cloud mode these top-level tools are not
 * registered at all; where a tool has both cloud-safe and local-only actions,
 * gating happens at the action level inside the tool instead (see
 * `ensureActionAllowedInCloudMode` in functions.ts / hosting.ts).
 *
 * IMPORTANT: keep this list in sync with the tools actually registered. Entries
 * that no longer match a registered tool name are dead (they silently gate
 * nothing). `CLOUD_INCOMPATIBLE_TOOLS.test.ts` asserts every entry here maps to
 * a known tool or a documented action-level exception to prevent silent rot.
 */
export const CLOUD_INCOMPATIBLE_TOOLS = [
  // Auth tools - local file uploads
  'auth',

  // Storage tools - local file uploads / downloads.
  // NOTE: `uploadFile` is not a top-level tool name (storage upload is exposed
  // via `manageStorage`); kept here as a documented action-level exception.
  'uploadFile',
  'manageStorage',

  // Function tools - local code uploads.
  // NOTE: createFunction / updateFunctionCode are now actions of `manageFunctions`,
  // not top-level tools, so gating them here is a no-op kept for documentation.
  // The real cloud-mode guard for those actions lives in
  // functions.ts#ensureActionAllowedInCloudMode. Left here intentionally so the
  // sync test flags them as "action-level exceptions" rather than removing the
  // record of why they are not top-level tools.
  'updateFunctionCode',
  'createFunction',

  // Declarative deploy tools - read local cloudbaserc and build the upload
  // artifact from cwd (process.cwd() when no cwd is passed). Same class as the
  // function/upload tools above: they have no meaning without a local project.
  'deployApply',
  'deployPlan',

  // Download tools - local file downloads
  'downloadTemplate',

  // Setup tools - local config file operations.
  // NOTE: `setupEnvironmentId` is not a top-level tool name; kept as a documented
  // action-level exception (env binding is handled via `auth`/setup flows).
  'setupEnvironmentId',

  // CloudRun tools - local file operations
  'manageCloudRun',

  // manageApps is intentionally NOT listed: deployApp with localPath/filePath is
  // blocked per-action in apps.ts (CLOUD_MODE_UNSUPPORTED_ACTION) so cloud mode
  // can still use getUploadUrl + cosTimestamp, deleteApp, and deleteAppVersion.
] as const;

/**
 * Tool names that appear in CLOUD_INCOMPATIBLE_TOOLS for documentation but are no
 * longer registered as top-level tools (their cloud gating is enforced at the
 * action level instead). The sync test treats these as expected, everything else
 * must resolve to a registered tool.
 */
export const CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS = [
  'createFunction',
  'updateFunctionCode',
  'uploadFile',
  'setupEnvironmentId',
] as const;

/**
 * Check if a tool should be registered in cloud mode
 * @param toolName - The name of the tool
 * @returns true if the tool should be registered in current mode
 */
export function shouldRegisterTool(toolName: string): boolean {
  // If not in cloud mode, register all tools
  if (!isCloudMode()) {
    return true;
  }

  return !CLOUD_INCOMPATIBLE_TOOLS.includes(toolName as (typeof CLOUD_INCOMPATIBLE_TOOLS)[number]);
}
