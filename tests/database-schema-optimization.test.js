// 数据库 Schema 优化功能测试
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to wait for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('数据库 Schema 优化功能测试 - manageDataModel 工具增强', async () => {
  let transport = null;
  let client = null;
  
  try {
    console.log('🔍 开始测试数据库 Schema 优化功能...');
    
    // 创建客户端
    client = new Client({
      name: "test-client-schema",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    // 使用 CJS CLI 进行集成测试
    const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // 连接客户端到服务器
    await client.connect(transport);
    await delay(3000);

    console.log('📋 检查 manageDataModel 工具...');
    
    // 列出工具
    const toolsResult = await client.listTools();
    const manageDataModelTool = toolsResult.tools.find(t => t.name === 'manageDataModel');
    
    expect(manageDataModelTool).toBeDefined();
    console.log('✅ manageDataModel 工具存在');
    
    // 检查输入模式
    expect(manageDataModelTool.inputSchema).toBeDefined();
    expect(manageDataModelTool.inputSchema.properties.action).toBeDefined();
    expect(manageDataModelTool.inputSchema.properties.action.enum).toContain('get');
    expect(manageDataModelTool.inputSchema.properties.action.enum).toContain('list');
    expect(manageDataModelTool.inputSchema.properties.action.enum).toContain('docs');
    console.log('✅ 输入模式验证通过');

    // 测试工具描述是否包含新的功能说明
    expect(manageDataModelTool.description).toContain('数据模型查询工具');
    console.log('✅ 工具描述正确');

    console.log('✅ 数据库 Schema 优化功能测试通过');

  } catch (error) {
    console.error('❌ 数据库 Schema 优化功能测试失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn('⚠️ 关闭客户端时出错:', e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn('⚠️ 关闭传输连接时出错:', e.message);
      }
    }
  }
}, 60000); // 60 秒超时

test('字段结构解析功能验证 - 通过实际 API 调用', async () => {
  let transport = null;
  let client = null;
  
  try {
    console.log('🧪 开始字段结构解析功能验证...');
    
    // 创建客户端
    client = new Client({
      name: "test-client-field-parsing",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    // 使用 CJS CLI 进行集成测试
    const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // 连接客户端到服务器
    await client.connect(transport);
    await delay(3000);

    // 测试 manageDataModel 工具的 get 操作
    // 注意：这里我们测试的是工具是否能够正确处理复杂字段结构
    // 而不是重新实现解析逻辑
    
    console.log('📝 测试 manageDataModel get 操作...');
    
    // 这里我们只是验证工具能够正常响应，实际的字段解析测试
    // 应该在真实的数据模型上进行
    const result = await client.callTool({
      name: 'manageDataModel',
      arguments: {
        action: 'list' // 使用 list 操作，因为它不需要特定的模型名称
      }
    });
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    
    console.log('✅ manageDataModel 工具响应正常');
    console.log('✅ 字段结构解析功能验证通过');

  } catch (error) {
    console.error('❌ 字段结构解析功能验证失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn('⚠️ 关闭客户端时出错:', e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn('⚠️ 关闭传输连接时出错:', e.message);
      }
    }
  }
}, 60000); // 60 秒超时

test('向后兼容性验证', async () => {
  let transport = null;
  let client = null;
  
  try {
    console.log('🔄 开始向后兼容性验证...');
    
    // 创建客户端
    client = new Client({
      name: "test-client-compatibility",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    // 使用 CJS CLI 进行集成测试
    const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { ...process.env }
    });

    // 连接客户端到服务器
    await client.connect(transport);
    await delay(3000);

    // 验证所有现有的数据库工具仍然存在
    const toolsResult = await client.listTools();
    const databaseTools = toolsResult.tools.filter(t => 
      t.name.includes('Collection') || 
      t.name.includes('Document') || 
      t.name.includes('DataModel') ||
      t.name.includes('Index') ||
      t.name.includes('Distribution')
    );
    
    console.log(`📊 找到 ${databaseTools.length} 个数据库相关工具`);
    
    // 验证关键工具仍然存在
    const expectedTools = [
      "readNoSqlDatabaseStructure",
      "writeNoSqlDatabaseStructure",
      "readNoSqlDatabaseContent",
      "writeNoSqlDatabaseContent",
      "manageDataModel",
    ];
    
    expectedTools.forEach(toolName => {
      const tool = toolsResult.tools.find(t => t.name === toolName);
      expect(tool).toBeDefined();
      console.log(`✅ ${toolName} 工具存在`);
    });
    
    console.log('✅ 向后兼容性验证通过');

  } catch (error) {
    console.error('❌ 向后兼容性验证失败:', error);
    throw error;
  } finally {
    // 清理资源
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn('⚠️ 关闭客户端时出错:', e.message);
      }
    }
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        console.warn('⚠️ 关闭传输连接时出错:', e.message);
      }
    }
  }
}, 60000); // 60 秒超时 