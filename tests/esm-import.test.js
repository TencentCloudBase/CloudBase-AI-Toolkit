// ES 模块导入测试
import { test, expect } from 'vitest';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('ESM import and library usage works correctly', async () => {
  console.log('Testing ESM import and library usage...');
  
  try {
    // 动态导入构建后的 ES 模块
    const serverModule = await import('../mcp/dist/index.js');
    console.log('✅ ES Module imported successfully');
    console.log('Available exports:', Object.keys(serverModule));
    
    expect(serverModule).toBeDefined();
    expect(typeof serverModule.createCloudBaseMcpServer).toBe('function');
    expect(typeof serverModule.getDefaultServer).toBe('function');
    
    // 创建服务器实例
    const server = serverModule.createCloudBaseMcpServer({
      name: 'test-server',
      version: '1.0.0',
      enableTelemetry: false // 测试时关闭遥测
    });
    
    expect(server).toBeDefined();
    console.log('✅ Server instance created successfully');
    
    console.log('✅ ESM import and library usage test passed');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}, 90000);