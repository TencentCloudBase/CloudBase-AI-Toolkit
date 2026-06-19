// 数据模型AI建模功能测试
import { expect, test } from 'vitest';

test('MCP 模块导入测试', async () => {
  try {
    console.log('🔍 开始测试 MCP 模块导入...');
    
    // 测试模块导入
    const mcpModule = await import('../mcp/dist/index.js');
    expect(mcpModule).toBeDefined();
    expect(mcpModule.createCloudBaseMcpServer).toBeDefined();
    console.log('✅ MCP 模块导入成功');
    
    // 测试服务器创建
    const server = mcpModule.createCloudBaseMcpServer({
      name: 'test-server',
      version: '1.0.0',
      enableTelemetry: false
    });
    expect(server).toBeDefined();
    console.log('✅ MCP 服务器创建成功');

    console.log('✅ MCP 模块导入测试通过');

  } catch (error) {
    console.error('❌ MCP 模块导入测试失败:', error);
    throw error;
  }
}, 30000);

test('Mermaid 转换库基础测试', async () => {
  try {
    console.log('🔍 开始测试 Mermaid 转换库基础功能...');
    
    // 动态导入 Mermaid 转换库（适应vitest环境）
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const transform = require('../mcp/node_modules/@cloudbase/cals/lib/cjs/utils/mermaid-datasource/mermaid-json-transform');
    expect(transform).toBeDefined();
    expect(transform.mermaidToJsonSchema).toBeDefined();
    expect(transform.jsonSchemaToMermaid).toBeDefined();
    console.log('✅ Mermaid 转换库导入成功');
    
    // 测试基础转换功能
    const testMermaid = `classDiagram
class User {
    name: string
    email: email
}`;
    
    const result = transform.mermaidToJsonSchema(testMermaid);
    expect(result).toBeDefined();
    expect(result.User).toBeDefined();
    expect(result.User.properties).toBeDefined();
    expect(result.User.properties.name.type).toBe('string');
    expect(result.User.properties.email.format).toBe('email');
    console.log('✅ 基础 Mermaid 转换功能正常');

    console.log('✅ Mermaid 转换库基础测试通过');

  } catch (error) {
    console.error('❌ Mermaid 转换库基础测试失败:', error);
    throw error;
  }
}, 30000);

test('Mermaid 复杂用例测试', async () => {
  try {
    console.log('🔍 开始测试 Mermaid 复杂用例...');
    
    // 动态导入 Mermaid 转换库
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const transform = require('../mcp/node_modules/@cloudbase/cals/lib/cjs/utils/mermaid-datasource/mermaid-json-transform');

    // 测试用例1：带默认值和必填字段
    console.log('  📝 测试带默认值和必填字段...');
    const complexMermaid1 = `classDiagram
class Product {
    name: string
    price: number
    stock: number = 0
    isActive: boolean = true
    required() ["name", "price"]
}`;

    const result1 = transform.mermaidToJsonSchema(complexMermaid1);
    expect(result1.Product.required).toContain('name');
    expect(result1.Product.required).toContain('price');
    expect(result1.Product.properties.stock.default).toBe(0);
    expect(result1.Product.properties.isActive.default).toBe(true);
    console.log('    ✅ 默认值和必填字段测试通过');

    // 测试用例2：枚举字段
    console.log('  📝 测试枚举字段...');
    const complexMermaid2 = `classDiagram
class Order {
    status: x-enum
    priority: x-enum
    enum_status() ["pending", "paid", "shipped"]
    enum_priority() ["low", "medium", "high"]
}`;

    const result2 = transform.mermaidToJsonSchema(complexMermaid2);
    expect(result2.Order.properties.status.format).toBe('x-enum');
    expect(result2.Order.properties.priority.format).toBe('x-enum');
    console.log('    ✅ 枚举字段测试通过');

    // 测试用例3：多种数据类型
    console.log('  📝 测试多种数据类型...');
    const complexMermaid3 = `classDiagram
class User {
    name: string
    email: email
    phone: phone
    age: number
    isVip: boolean
    birthDate: date
    lastLogin: datetime
    profileImage: x-image
    biography: x-rtf
    location: x-location
}`;

    const result3 = transform.mermaidToJsonSchema(complexMermaid3);
    expect(result3.User.properties.name.type).toBe('string');
    expect(result3.User.properties.email.format).toBe('email');
    expect(result3.User.properties.phone.format).toBe('phone');
    expect(result3.User.properties.age.type).toBe('number');
    expect(result3.User.properties.isVip.type).toBe('boolean');
    console.log('    ✅ 多种数据类型测试通过');

    console.log('✅ Mermaid 复杂用例测试通过');

  } catch (error) {
    console.error('❌ Mermaid 复杂用例测试失败:', error);
    throw error;
  }
}, 30000);

test('Mermaid 规则验证测试', async () => {
  try {
    console.log('🔍 开始测试 Mermaid 规则验证...');
    
    // 动态导入 Mermaid 转换库
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const transform = require('../mcp/node_modules/@cloudbase/cals/lib/cjs/utils/mermaid-datasource/mermaid-json-transform');
    
    // 测试用例1：基本字段类型
    console.log('  📝 测试基本字段类型...');
    const basicMermaid = `classDiagram
class User {
    name: string
    email: email
    phone: phone
    age: number
    isVip: boolean
    birthDate: date
    lastLogin: datetime
    profileImage: x-image
    biography: x-rtf
    location: x-location
}`;

    const basicResult = transform.mermaidToJsonSchema(basicMermaid);
    expect(basicResult).toBeDefined();
    expect(basicResult.User).toBeDefined();
    expect(basicResult.User.properties).toBeDefined();
    
    // 验证字段类型映射
    expect(basicResult.User.properties.name.type).toBe('string');
    expect(basicResult.User.properties.email.format).toBe('email');
    expect(basicResult.User.properties.phone.format).toBe('phone');
    expect(basicResult.User.properties.age.type).toBe('number');
    expect(basicResult.User.properties.isVip.type).toBe('boolean');
    console.log('    ✅ 基本字段类型验证通过');

    // 测试用例2：必填字段和默认值
    console.log('  📝 测试必填字段和默认值...');
    const requiredMermaid = `classDiagram
class Product {
    name: string
    price: number
    stock: number = 0
    isActive: boolean = true
    required() ["name", "price"]
}`;

    const requiredResult = transform.mermaidToJsonSchema(requiredMermaid);
    expect(requiredResult.Product.required).toContain('name');
    expect(requiredResult.Product.required).toContain('price');
    expect(requiredResult.Product.properties.stock.default).toBe(0);
    expect(requiredResult.Product.properties.isActive.default).toBe(true);
    console.log('    ✅ 必填字段和默认值验证通过');

    // 测试用例3：枚举字段
    console.log('  📝 测试枚举字段...');
    const enumMermaid = `classDiagram
class Order {
    status: x-enum
    priority: x-enum
    enum_status() ["pending", "paid", "shipped", "completed"]
    enum_priority() ["low", "medium", "high"]
}`;

    const enumResult = transform.mermaidToJsonSchema(enumMermaid);
    expect(enumResult.Order.properties.status.format).toBe('x-enum');
    console.log('    ✅ 枚举字段验证通过');

    console.log('✅ Mermaid 规则验证测试通过');

  } catch (error) {
    console.error('❌ Mermaid 规则验证测试失败:', error);
    throw error;
  }
}, 60000); 