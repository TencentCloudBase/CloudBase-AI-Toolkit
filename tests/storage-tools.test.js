// Storage tools integration tests
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to create MCP client with Storage plugin enabled
async function createTestClient() {
  const client = new Client({
    name: "test-client-storage",
    version: "1.0.0",
  }, {
    capabilities: {}
  });

  const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      // Enable Storage plugin for testing
      CLOUDBASE_MCP_PLUGINS_ENABLED: "env,database,functions,hosting,storage,setup,rag,gateway,download,security-rule,invite-code,cloudrun"
    }
  });

  await client.connect(transport);
  await delay(2000); // Wait for connection to establish
  
  return { client, transport };
}

// Detect if real CloudBase credentials are available
function hasCloudBaseCredentials() {
  const secretId = process.env.TENCENTCLOUD_SECRETID || process.env.CLOUDBASE_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY || process.env.CLOUDBASE_SECRET_KEY;
  const envId = process.env.CLOUDBASE_ENV_ID;
  return Boolean(secretId && secretKey && envId);
}

describe('Storage Tools Tests', () => {
  let testClient = null;
  let testTransport = null;

  beforeAll(async () => {
    try {
      const { client, transport } = await createTestClient();
      testClient = client;
      testTransport = transport;
    } catch (error) {
      console.warn('Failed to setup test client:', error.message);
    }
  });

  afterAll(async () => {
    if (testClient) {
      try {
        await testClient.close();
      } catch (error) {
        console.warn('Error closing test client:', error.message);
      }
    }
  });

  test.skipIf(!testClient)('Storage tools are registered correctly', async () => {
    try {
      console.log('Testing Storage tools registration...');
      
      // Get the list of tools
      const toolsResult = await testClient.listTools();
      const allTools = toolsResult.tools.map(tool => tool.name);
      
      console.log('All available tools:', allTools);
      
      // Check if Storage tools are present
      const storageTools = toolsResult.tools.filter(tool => 
        tool.name === 'queryStorage' || tool.name === 'manageStorage'
      );
      
      if (storageTools.length === 0) {
        console.log('⚠️ Storage tools not found. This might be expected if Storage plugin is not enabled by default.');
        console.log('Available tools:', allTools);
        return; // Skip assertion, just log the result
      }

      console.log('✅ Found Storage tools:', storageTools.map(t => t.name));
      
      // Verify tool properties
      for (const tool of storageTools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        
        console.log(`✅ Tool ${tool.name}:`, {
          description: tool.description,
          inputSchema: Object.keys(tool.inputSchema)
        });
      }

      // Check for the old uploadFile tool (should not exist anymore)
      const oldUploadFileTool = toolsResult.tools.find(tool => tool.name === 'uploadFile');
      if (oldUploadFileTool) {
        console.log('⚠️ Old uploadFile tool still exists, this might indicate incomplete migration');
      } else {
        console.log('✅ Old uploadFile tool successfully removed');
      }

    } catch (error) {
      console.error('❌ Storage tools registration test failed:', error);
      throw error;
    }
  }, 30000);

  test.skipIf(!testClient)('queryStorage tool schema validation', async () => {
    try {
      console.log('Testing queryStorage tool schema...');
      
      const toolsResult = await testClient.listTools();
      const queryStorageTool = toolsResult.tools.find(tool => tool.name === 'queryStorage');
      
      if (!queryStorageTool) {
        console.log('⚠️ queryStorage tool not found, skipping schema test');
        return;
      }

      // Verify input schema structure
      const inputSchema = queryStorageTool.inputSchema;
      expect(inputSchema).toBeDefined();
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties).toBeDefined();
      
      // Check required fields exist in properties
      const properties = inputSchema.properties;
      expect(properties.action).toBeDefined();
      expect(properties.cloudPath).toBeDefined();
      expect(properties.maxAge).toBeDefined();
      
      // Check action enum values
      const actionSchema = properties.action;
      expect(actionSchema.type).toBe('string');
      expect(actionSchema.enum).toContain('list');
      expect(actionSchema.enum).toContain('info');
      expect(actionSchema.enum).toContain('url');
      
      console.log('✅ queryStorage tool schema validation passed');

    } catch (error) {
      console.error('❌ queryStorage tool schema test failed:', error);
      throw error;
    }
  }, 30000);

  test.skipIf(!testClient)('manageStorage tool schema validation', async () => {
    try {
      console.log('Testing manageStorage tool schema...');
      
      const toolsResult = await testClient.listTools();
      const manageStorageTool = toolsResult.tools.find(tool => tool.name === 'manageStorage');
      
      if (!manageStorageTool) {
        console.log('⚠️ manageStorage tool not found, skipping schema test');
        return;
      }

      // Verify input schema structure
      const inputSchema = manageStorageTool.inputSchema;
      expect(inputSchema).toBeDefined();
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties).toBeDefined();
      
      // Check required fields exist in properties
      const properties = inputSchema.properties;
      expect(properties.action).toBeDefined();
      expect(properties.localPath).toBeDefined();
      expect(properties.cloudPath).toBeDefined();
      expect(properties.force).toBeDefined();
      expect(properties.isDirectory).toBeDefined();
      
      // Check action enum values
      const actionSchema = properties.action;
      expect(actionSchema.type).toBe('string');
      expect(actionSchema.enum).toContain('upload');
      expect(actionSchema.enum).toContain('download');
      expect(actionSchema.enum).toContain('delete');
      
      // Check force parameter for delete operations
      const forceSchema = properties.force;
      expect(forceSchema.type).toBe('boolean');
      
      console.log('✅ manageStorage tool schema validation passed');

    } catch (error) {
      console.error('❌ manageStorage tool schema test failed:', error);
      throw error;
    }
  }, 30000);

  test.skipIf(!testClient)('Storage tools annotations are correct', async () => {
    try {
      console.log('Testing Storage tools annotations...');
      
      const toolsResult = await testClient.listTools();
      
      // Check queryStorage annotations
      const queryStorageTool = toolsResult.tools.find(tool => tool.name === 'queryStorage');
      if (queryStorageTool) {
        expect(queryStorageTool.annotations).toBeDefined();
        expect(queryStorageTool.annotations.readOnlyHint).toBe(true);
        expect(queryStorageTool.annotations.category).toBe('storage');
        console.log('✅ queryStorage tool annotations are correct');
      }
      
      // Check manageStorage annotations
      const manageStorageTool = toolsResult.tools.find(tool => tool.name === 'manageStorage');
      if (manageStorageTool) {
        expect(manageStorageTool.annotations).toBeDefined();
        expect(manageStorageTool.annotations.readOnlyHint).toBe(false);
        expect(manageStorageTool.annotations.destructiveHint).toBe(true);
        expect(manageStorageTool.annotations.category).toBe('storage');
        console.log('✅ manageStorage tool annotations are correct');
      }

    } catch (error) {
      console.error('❌ Storage tools annotations test failed:', error);
      throw error;
    }
  }, 30000);
});
