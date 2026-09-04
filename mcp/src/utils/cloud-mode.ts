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
 * Check if a tool should be registered in cloud mode
 * @param toolName - The name of the tool
 * @returns true if the tool should be registered in current mode
 */
export function shouldRegisterTool(toolName: string): boolean {
  // If not in cloud mode, register all tools
  if (!isCloudMode()) {
    return true;
  }

  // Cloud-incompatible tools that involve local file operations
  const cloudIncompatibleTools = [
    // Auth tools - local file uploads
    'auth',

    // Storage tools - local file uploads
    'uploadFile',

    // Hosting tools - action-level cloud gating is handled inside manageHosting

    // Function tools - local code uploads
    'updateFunctionCode',
    'createFunction', // also involves local files


    // Download tools - local file downloads
    'downloadTemplate',

    // Setup tools - local config file operations
    'setupEnvironmentId',

    // CloudRun tools - local file operations
    'manageCloudRun',
    // Download tools - local file downloads
    'manageStorage',
  ];

  return !cloudIncompatibleTools.includes(toolName);
}
