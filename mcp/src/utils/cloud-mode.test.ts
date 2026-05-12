import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  debug: vi.fn(),
}));

import { shouldRegisterTool } from './cloud-mode.js';

const originalCloudMode = process.env.CLOUDBASE_MCP_CLOUD_MODE;
const originalMcpCloudMode = process.env.MCP_CLOUD_MODE;

afterEach(() => {
  if (originalCloudMode === undefined) {
    delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
  } else {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = originalCloudMode;
  }

  if (originalMcpCloudMode === undefined) {
    delete process.env.MCP_CLOUD_MODE;
  } else {
    process.env.MCP_CLOUD_MODE = originalMcpCloudMode;
  }
});

describe('shouldRegisterTool', () => {
  it('should keep manageHosting registered in cloud mode for action-level gating', () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
    delete process.env.MCP_CLOUD_MODE;

    expect(shouldRegisterTool('manageHosting')).toBe(true);
  });

  it('should still block fully local-only tools in cloud mode', () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
    delete process.env.MCP_CLOUD_MODE;

    expect(shouldRegisterTool('uploadFile')).toBe(false);
  });
});
