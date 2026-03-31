import { debug } from './logger.js';

/**
 * Check if MCP is running in cloud mode
 * Cloud mode is enabled by:
 * 1. Command line argument --cloud-mode
 * 2. Environment variable CLOUDBASE_MCP_CLOUD_MODE=true
 * 3. Environment variable MCP_CLOUD_MODE=true
 */
export function isCloudMode(): boolean {
  // Check for CLI argument first
  const hasCloudModeArg = process.argv.includes('--cloud-mode');
  
  // Check environment variables
  const cloudModeEnabled = process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true' || 
                          process.env.MCP_CLOUD_MODE === 'true';
  
  const isEnabled = hasCloudModeArg || cloudModeEnabled;
  
  if (isEnabled) {
    debug('Cloud mode is enabled', { 
      source: hasCloudModeArg ? 'CLI_ARG' : 'ENV_VAR',
      envVar: process.env.CLOUDBASE_MCP_CLOUD_MODE || process.env.MCP_CLOUD_MODE 
    });
  }
  
  return isEnabled;
}

/**
 * Enable cloud mode by setting environment variable
 */
export function enableCloudMode(): void {
  process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
  debug('Cloud mode enabled via API call');
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
    
    // Hosting tools - local file uploads  
    'uploadFiles',
    
    // Function tools - local code uploads
    'updateFunctionCode',
    'createFunction', // also involves local files
    
    
    // Download tools - local file downloads
    'downloadTemplate',
    'downloadRemoteFile',
    
    // Setup tools - local config file operations
    'setupEnvironmentId',
    
    // CloudRun tools - local file operations
    'manageCloudRun',
    // Download tools - local file downloads
    'manageStorage',
  ];

  const shouldRegister = !cloudIncompatibleTools.includes(toolName);
  
  if (!shouldRegister) {
    debug(`Cloud mode: skipping registration of incompatible tool: ${toolName}`);
  }
  
  return shouldRegister;
}

