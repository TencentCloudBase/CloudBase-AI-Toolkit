# 技术方案设计

## 架构概述

通过修改遥测数据获取机制，让遥测上报函数能够访问到服务器实例中存储的 `cloudBaseOptions`，优先使用传入的环境ID配置。

## 技术方案

### 方案 1：参数传递（推荐）

通过修改工具包装器，将服务器配置作为参数传递给遥测上报函数。

#### 优势
- 数据流清晰，无全局状态
- 实现相对简单
- 保持函数式编程风格

#### 实现细节

1. **修改工具包装器**
   ```typescript
   // 在 tool-wrapper.ts 中修改 createWrappedHandler
   function createWrappedHandler(name: string, handler: any, cloudBaseOptions?: CloudBaseOptions) {
     return async (args: any) => {
       // ... 现有逻辑 ...
       
       // 上报时传递配置
       reportToolCall({
         toolName: name,
         success,
         duration,
         error: errorMessage,
         inputParams: sanitizeArgs(args),
         cloudBaseOptions // 新增参数
       });
     };
   }
   ```

2. **修改遥测上报函数**
   ```typescript
   // 在 telemetry.ts 中修改 reportToolCall
   export const reportToolCall = async (params: {
     toolName: string;
     success: boolean;
     duration?: number;
     error?: string;
     inputParams?: any;
     cloudBaseOptions?: CloudBaseOptions; // 新增参数
   }) => {
     // 优先使用传入的配置
     const envId = params.cloudBaseOptions?.envId || 
                   process.env.CLOUDBASE_ENV_ID || 
                   await loadEnvIdFromUserConfig() || 
                   'unknown';
   }
   ```

3. **修改服务器包装逻辑**
   ```typescript
   // 在 tool-wrapper.ts 中修改 wrapServerWithTelemetry
   export function wrapServerWithTelemetry(server: ExtendedMcpServer): void {
     const originalRegisterTool = server.registerTool.bind(server);
     
     server.registerTool = function(toolName: string, toolConfig: any, handler: any) {
       const wrappedHandler = createWrappedHandler(toolName, handler, server.cloudBaseOptions);
       return originalRegisterTool(toolName, toolConfig, wrappedHandler);
     };
   }
   ```

### 方案 2：闭包传递

通过闭包捕获服务器配置，在工具包装器中创建包含配置的闭包。

#### 优势
- 完全避免全局状态
- 数据封装性好

#### 实现细节

```typescript
// 在 tool-wrapper.ts 中
export function wrapServerWithTelemetry(server: ExtendedMcpServer): void {
  const cloudBaseOptions = server.cloudBaseOptions; // 捕获配置
  
  const originalRegisterTool = server.registerTool.bind(server);
  
  server.registerTool = function(toolName: string, toolConfig: any, handler: any) {
    const wrappedHandler = createWrappedHandler(name, handler, cloudBaseOptions);
    return originalRegisterTool(toolName, toolConfig, wrappedHandler);
  };
}
```

## 技术选型

**选择方案 1**，原因：
- 参数传递更明确，数据流清晰
- 易于测试和调试
- 符合函数式编程原则
- 避免全局状态依赖

## 数据库/接口设计

无需数据库变更，仅涉及内存中的配置存储。

## 测试策略

1. **单元测试**
   - 测试环境ID获取优先级逻辑
   - 测试配置设置和获取功能
   - 测试回退机制

2. **集成测试**
   - 测试服务器创建时的配置传递
   - 测试工具调用时的遥测数据上报
   - 测试生命周期事件的遥测数据上报

## 安全性

- 全局配置存储仅在内存中，不涉及持久化
- 敏感信息（如 secretId、secretKey）不会在遥测中上报
- 保持现有的参数清理机制

## 向后兼容性

- 保持所有现有接口不变
- 遥测上报函数的调用方式不变
- 环境变量和配置文件的支持保持不变

## 实施计划

1. 修改 `telemetry.ts` 添加全局配置存储
2. 更新环境ID获取逻辑
3. 修改 `server.ts` 在服务器创建时设置全局配置
4. 添加单元测试
5. 验证功能完整性 