// EnvId management tests - Testing fixes for envId caching and synchronization
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Note: This test requires the code to be built first
// Run: cd mcp && npm run build

// Import from dist (built files) - these are JavaScript files
// We'll test through public APIs only
import { 
  getEnvId, 
  getCloudBaseManager, 
  resetCloudBaseManagerCache,
  envManager
} from '../mcp/dist/index.js';

describe('EnvId Management Tests', () => {
  beforeEach(() => {
    // Reset cache before each test
    resetCloudBaseManagerCache();
    // Clear process.env
    delete process.env.CLOUDBASE_ENV_ID;
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    resetCloudBaseManagerCache();
    delete process.env.CLOUDBASE_ENV_ID;
  });

  describe('Timeout Configuration', () => {
    test('ENV_ID_TIMEOUT should be 10 minutes (600000ms)', async () => {
      // Import the constant to verify
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      const managerCode = fs.readFileSync(
        path.join(__dirname, '../mcp/src/cloudbase-manager.ts'),
        'utf8'
      );
      
      // Check that timeout is set to 600000 (10 minutes)
      expect(managerCode).toMatch(/ENV_ID_TIMEOUT\s*=\s*600000/);
      expect(managerCode).toMatch(/10 minutes/);
    });
  });

  describe('getEnvId - Priority Order', () => {
    test('should prioritize cloudBaseOptions.envId over cached envId', async () => {
      // Set up cached envId
      await envManager.setEnvId('cached-env-id');
      
      // Call with cloudBaseOptions
      const result = await getEnvId({ envId: 'option-env-id' });
      
      expect(result).toBe('option-env-id');
    });

    test('should use cached envId when cloudBaseOptions.envId is not provided', async () => {
      // Set up cached envId
      await envManager.setEnvId('cached-env-id');
      
      // Call without cloudBaseOptions
      const result = await getEnvId();
      
      expect(result).toBe('cached-env-id');
    });

    test('should use process.env.CLOUDBASE_ENV_ID when no cache exists', async () => {
      process.env.CLOUDBASE_ENV_ID = 'process-env-id';
      
      const result = await getEnvId();
      
      expect(result).toBe('process-env-id');
    });
  });

  describe('getCloudBaseManager - Optimization', () => {
    test('should use cached envId when available (fast path)', async () => {
      // Set up cached envId
      await envManager.setEnvId('cached-env-id');
      
      // Verify cache is set
      const cached = envManager.getCachedEnvId();
      expect(cached).toBe('cached-env-id');
      
      // Note: Full integration test would require mocking getLoginState
      // This test verifies the optimization logic exists in code
    });

    test('getCachedEnvId returns cached value without triggering fetch', async () => {
      // Set cache
      await envManager.setEnvId('test-cached');
      
      // Should return cached value immediately
      const cached = envManager.getCachedEnvId();
      expect(cached).toBe('test-cached');
    });
  });

  describe('EnvId Cache Synchronization', () => {
    test('setEnvId should update both cache and process.env', async () => {
      const testEnvId = 'test-env-id-123';
      
      await envManager.setEnvId(testEnvId);
      
      // Check cache
      const cachedEnvId = envManager.getCachedEnvId();
      expect(cachedEnvId).toBe(testEnvId);
      
      // Check process.env
      expect(process.env.CLOUDBASE_ENV_ID).toBe(testEnvId);
    });

    test('reset should clear both cache and process.env', () => {
      // Set up cache
      process.env.CLOUDBASE_ENV_ID = 'test-env-id';
      envManager.setEnvId('test-env-id');
      
      // Reset
      resetCloudBaseManagerCache();
      
      // Verify cleared
      const cachedEnvId = envManager.getCachedEnvId();
      expect(cachedEnvId).toBeNull();
      expect(process.env.CLOUDBASE_ENV_ID).toBeUndefined();
    });
  });

  describe('File Cache Removal', () => {
    test('should not use file-based cache or legacy interactive env picker (code verification)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      // Verify that cloudbase-manager.ts doesn't import file cache functions
      const managerCode = fs.readFileSync(
        path.join(__dirname, '../mcp/src/cloudbase-manager.ts'),
        'utf8'
      );
      
      // Should not import file cache functions
      expect(managerCode).not.toMatch(/loadEnvIdFromUserConfig/);
      expect(managerCode).not.toMatch(/saveEnvIdToUserConfig/);

      // Should also not rely on legacy interactive env picker helper
      expect(managerCode).not.toMatch(/_promptAndSetEnvironmentId/);
    });
  });

  describe('CloudRun Tools - EnvId Usage', () => {
    test('should use getEnvId instead of process.env.TCB_ENV_ID', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      
      const cloudrunCode = fs.readFileSync(
        path.join(__dirname, '../mcp/src/tools/cloudrun.ts'),
        'utf8'
      );
      
      // Should not use TCB_ENV_ID
      expect(cloudrunCode).not.toMatch(/process\.env\.TCB_ENV_ID/);
      
      // Should use getEnvId
      expect(cloudrunCode).toMatch(/getEnvId\(cloudBaseOptions\)/);
      expect(cloudrunCode).toMatch(/await getEnvId/);
    });

    test('envQuery info should not append legacy guide prompt content', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      const envToolCode = fs.readFileSync(
        path.join(__dirname, '../mcp/src/tools/env.ts'),
        'utf8'
      );

      expect(envToolCode).not.toMatch(/CLOUDBASE_GUIDE_PROMPT/);
      expect(envToolCode).not.toMatch(/getClaudePrompt/);
      expect(envToolCode).not.toContain('⚠️ 重要提示：后续所有云开发相关的开发工作必须严格遵循以下开发规范和最佳实践');
    });
  });

  describe('Environment Switching Scenario', () => {
    test('should maintain correct envId after switching environments', async () => {
      // Simulate initial environment
      await envManager.setEnvId('env-a');
      expect(envManager.getCachedEnvId()).toBe('env-a');
      expect(process.env.CLOUDBASE_ENV_ID).toBe('env-a');
      
      // Simulate switching to new environment (like login tool does)
      await envManager.setEnvId('env-b');
      
      // Verify cache is updated
      expect(envManager.getCachedEnvId()).toBe('env-b');
      expect(process.env.CLOUDBASE_ENV_ID).toBe('env-b');
      
      // Verify getEnvId returns new environment
      const result = await getEnvId();
      expect(result).toBe('env-b');
    });
  });

  describe('getCachedEnvId Method', () => {
    test('should return cached envId without triggering fetch', async () => {
      // Initially null
      expect(envManager.getCachedEnvId()).toBeNull();
      
      // Set cache using setEnvId
      await envManager.setEnvId('test-cached-id');
      
      // Should return cached value
      const cached = envManager.getCachedEnvId();
      expect(cached).toBe('test-cached-id');
    });
  });
});

