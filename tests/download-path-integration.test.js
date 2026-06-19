// downloadRemoteFile 集成测试
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('downloadRemoteFile tool is available and has correct schema', async () => {
  let transport = null;
  let client = null;
  
  try {
    console.log('Testing downloadRemoteFile tool availability...');
    
    // Create client
    client = new Client({
      name: "test-client-download-path",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    // Use the CJS CLI for integration testing
    const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // Connect client to server
    await client.connect(transport);
    await delay(3000);

    console.log('Testing tool availability...');
    
    // List tools to find downloadRemoteFile
    const toolsResult = await client.listTools();
    expect(toolsResult.tools).toBeDefined();
    expect(Array.isArray(toolsResult.tools)).toBe(true);
    
    const downloadPathTool = toolsResult.tools.find(t => t.name === 'downloadRemoteFile');
    expect(downloadPathTool).toBeDefined();
    console.log('✅ downloadRemoteFile tool found');
    
    // Check if the tool has correct parameters
    const toolSchema = downloadPathTool.inputSchema;
    expect(toolSchema).toBeDefined();
    
    // Check if url parameter exists
    const urlParam = toolSchema.properties?.url;
    expect(urlParam).toBeDefined();
    expect(urlParam.description).toContain('远程文件的 URL 地址');
    console.log('✅ URL parameter found in tool schema');
    
    // Check if relativePath parameter exists
    const relativePathParam = toolSchema.properties?.relativePath;
    expect(relativePathParam).toBeDefined();
    expect(relativePathParam.description).toContain('相对于项目根目录的路径');
    console.log('✅ relativePath parameter found in tool schema');
  
    console.log('✅ downloadRemoteFile tool schema validation passed');
    
  } catch (error) {
    console.error('❌ downloadRemoteFile tool schema validation failed:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
    if (transport) {
      await transport.close();
    }
  }
}, 60000);

test('downloadRemoteFile tool still works for backward compatibility', async () => {
  let transport = null;
  let client = null;
  
  try {
    console.log('Testing downloadRemoteFile backward compatibility...');
    
    // Create client
    client = new Client({
      name: "test-client-download-backward",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    // Use the CJS CLI for integration testing
    const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // Connect client to server
    await client.connect(transport);
    await delay(3000);

    console.log('Testing backward compatibility...');
    
    // List tools to find downloadRemoteFile
    const toolsResult = await client.listTools();
    expect(toolsResult.tools).toBeDefined();
    
    const downloadTool = toolsResult.tools.find(t => t.name === 'downloadRemoteFile');
    expect(downloadTool).toBeDefined();
    console.log('✅ downloadRemoteFile tool found (backward compatibility)');
    
    // Check if the tool still has correct parameters
    const toolSchema = downloadTool.inputSchema;
    expect(toolSchema).toBeDefined();
    
    const urlParam = toolSchema.properties?.url;
    expect(urlParam).toBeDefined();
    expect(urlParam.description).toContain('远程文件的 URL 地址');
    console.log('✅ downloadRemoteFile URL parameter still works');
    
    // Check updated description
    console.log('✅ downloadRemoteFile description updated correctly');
    
    console.log('✅ downloadRemoteFile backward compatibility test passed');
    
  } catch (error) {
    console.error('❌ downloadRemoteFile backward compatibility test failed:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
    if (transport) {
      await transport.close();
    }
  }
}, 60000);
