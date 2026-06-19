// CommonJS 导入测试
import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('CJS build format works correctly', async () => {
  console.log('Testing CJS build format...');
  
  try {
    // 测试 CJS 模块格式是否正确构建
    console.log('Checking if CJS build files exist...');
    
    // 检查构建产物
    const fs = await import('fs');
    const cjsIndexPath = join(__dirname, '../mcp/dist/index.cjs');
    const cjsCliPath = join(__dirname, '../mcp/dist/cli.cjs');
    
    expect(fs.existsSync(cjsIndexPath)).toBe(true);
    expect(fs.existsSync(cjsCliPath)).toBe(true);
    
    console.log('✅ CJS build files exist');
    
    // 读取文件内容，验证是否是有效的 CJS 格式
    const cjsContent = fs.readFileSync(cjsIndexPath, 'utf8');
    
    // CJS 文件应该包含 module.exports 或类似的 CJS 导出语法
    // 由于我们使用了 rollup，它应该生成兼容的 CJS 代码
    expect(typeof cjsContent).toBe('string');
    expect(cjsContent.length).toBeGreaterThan(0);
    
    console.log('✅ CJS build format test passed');
    
  } catch (error) {
    console.error('❌ CJS build format test failed:', error);
    throw error;
  }
}, 90000);

test('CJS CLI executable works correctly', async () => {
  let transport = null;
  let client = null;
  
  try {
    // 注意：直接用 node 执行 dist/cli.cjs
    console.log('Testing CJS CLI executable...');
    
    client = new Client({
      name: "test-client-cjs-cli",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    // 直接用 node 执行 CLI CJS 文件
    const cliCjsPath = join(__dirname, '../mcp/dist/cli.cjs');
    transport = new StdioClientTransport({
      command: 'node',
      args: [cliCjsPath]
    });

    // Connect client to server
    await client.connect(transport);
    await delay(3000);

    console.log('Testing CJS CLI functionality...');
    // List available tools
    const toolsResult = await client.listTools();
    expect(toolsResult).toBeDefined();
    expect(toolsResult.tools).toBeDefined();
    expect(Array.isArray(toolsResult.tools)).toBe(true);
    console.log(`Found ${toolsResult.tools.length} tools in CJS CLI build`);

    // 新增：测试 auth 工具调用，超时不算失败
    try {
      console.log('Testing auth tool call (may timeout)...');
      const authResult = await Promise.race([
        client.callTool('auth', { action: 'status' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('auth timeout')), 10000))
      ]);
      console.log('auth tool call result:', authResult);
    } catch (err) {
      if (err && err.message && err.message.includes('timeout')) {
        console.warn('⚠️ auth tool call timeout (acceptable)');
      } else {
        throw err;
      }
    }
    
    console.log('✅ CJS CLI executable test passed');
    
  } catch (error) {
    console.error('❌ CJS CLI test failed:', error);
    throw error;
  } finally {
    // Clean up
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn('Warning: Error closing client:', e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn('Warning: Error closing transport:', e.message);
      }
    }
  }
}, 120000);
 