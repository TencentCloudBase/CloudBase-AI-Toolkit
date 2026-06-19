// Scenario configuration data structure

const SCENARIO_CONFIG = {
  'create-database-table': {
    id: 'create-database-table',
    name: '创建数据库表',
    description: '使用 AI 设计并创建 MySQL 数据库表结构',
    buttonText: '使用 AI 设计数据库表结构',
    buttonPosition: '表管理页面，"表管理"标题右侧',
    pagePath: '/db/mysql/table/default/',
    mcpTools: ['executeWriteSQL', 'writeSecurityRule'],
    capabilityDocs: ['relational-database-tool', 'relational-database-web'],
    promptTemplate: `我正在使用云开发平台的MySQL数据库创建数据表，需要你的帮助：

1. **分析业务需求并设计表结构**：
   - 业务场景：[用户填写，例如：用户管理系统、订单系统等]
   - 数据关系：[用户填写，例如：用户-订单一对多关系]
   - 使用 CloudBase MCP 工具分析需求，设计合理的表结构
   - 参考 \`relational-database-tool\` 规则，设计符合最佳实践的表结构

2. **创建数据库表**：
   - 使用 CloudBase MCP 工具 \`executeWriteSQL\` 执行 CREATE TABLE 语句
   - 设计合适的索引（使用 CREATE INDEX）
   - 配置安全规则（使用 \`writeSecurityRule\` 设置表权限）
   - **重要**：必须包含 \`_openid VARCHAR(64) DEFAULT '' NOT NULL\` 字段用于用户访问控制

3. **生成操作代码**：
   - 使用 \`relational-database-web\` 规则生成前端代码（Web SDK）
   - 生成后端代码（Node SDK 或 HTTP API）
   - 提供完整的CRUD操作示例

请帮我完成从表设计到代码生成的完整流程。`
  },
  
  'create-cloud-function': {
    id: 'create-cloud-function',
    name: '创建云函数',
    description: '使用 AI 创建云函数并生成调用代码',
    buttonText: '使用 AI 创建云函数',
    buttonPosition: '云函数列表页，"云函数列表"标题右侧',
    pagePath: '/scf',
    mcpTools: ['createFunction', 'updateFunctionCode'],
    capabilityDocs: ['cloudbase-platform', 'cloud-functions'],
    promptTemplate: `我需要创建一个云函数，但不知道如何编写代码和配置。请帮助我：

1. **分析函数需求**：
   - 函数功能：[用户填写，例如：处理订单、发送通知等]
   - 输入参数：[用户填写]
   - 输出结果：[用户填写]

2. **创建云函数**：
   - 使用 CloudBase MCP 工具 \`createFunction\` 创建函数
   - 生成函数代码（Node.js），包含 \`package.json\` 声明依赖
   - 配置函数环境变量和超时时间
   - 使用 \`updateFunctionCode\` 部署函数代码

3. **生成调用代码**：
   - 如果是Web项目，生成前端调用代码（使用 @cloudbase/js-sdk）
   - 如果是小程序项目，生成小程序调用代码（使用 wx.cloud.callFunction）
   - 如果是后端项目，生成HTTP API调用代码

请帮我完成云函数的创建和集成。`
  },
  
  'integrate-auth': {
    id: 'integrate-auth',
    name: '集成登录功能',
    description: '使用 AI 集成身份认证功能到项目中',
    buttonText: '使用 AI 集成登录功能',
    buttonPosition: '"快速开始"区域，"选择开发语言"下方',
    pagePath: '/identity/quick-start',
    mcpTools: ['readSecurityRule', 'writeSecurityRule'],
    capabilityDocs: ['auth-web', 'auth-wechat', 'auth-nodejs', 'auth-tool'],
    promptTemplate: `我看到云开发平台提供了身份认证功能，但不知道如何集成到我的项目中。请帮助我：

1. **了解登录功能**：
   - 查看 CloudBase 身份认证文档：
     - 如果是Web项目，参考 \`auth-web\` 规则（使用 @cloudbase/js-sdk@2.x）
     - 如果是小程序项目，参考 \`auth-wechat\` 规则（自然免登录）
     - 如果是后端项目，参考 \`auth-nodejs\` 规则
   - 使用 CloudBase MCP 工具 \`readSecurityRule\` 查看当前认证配置
   - 使用 \`auth-tool\` 相关MCP工具配置登录方式

2. **生成集成代码**：
   - 分析我的项目结构（框架、技术栈）
   - **重要**：必须严格区分平台（Web vs 小程序），不能混用认证方法
   - 如果是Web项目：
     - 使用 \`auth-web\` 规则生成登录页组件代码
     - 默认使用手机号+SMS验证码登录（passwordless）
     - 使用 SDK 内置认证功能，不要用云函数实现登录逻辑
   - 如果是小程序项目：
     - 使用 \`auth-wechat\` 规则，说明自然免登录特性
     - 生成用户管理代码（基于 openid）
   - 提供完整的认证流程代码

3. **配置认证方式**：
   - 使用 CloudBase MCP 工具配置登录方式（SMS、Email、Username/Password等）
   - 生成完整的认证流程代码

请帮我完成登录功能的集成。`
  },
  
  'analyze-function-error': {
    id: 'analyze-function-error',
    name: '分析函数错误',
    description: '使用 AI 分析云函数错误并修复',
    buttonText: '使用 AI 分析并修复错误',
    buttonPosition: '函数详情页，日志标签页内，错误日志条目旁',
    pagePath: '/scf/detail',
    mcpTools: ['queryFunctions', 'manageFunctions'],
    capabilityDocs: ['cloudbase-platform', 'cloud-functions'],
    promptTemplate: `我的云函数出现了错误，需要你的帮助分析和修复：

1. **获取错误日志**：
   - 函数名称：[系统自动填充或用户填写]
   - 错误时间：[系统自动填充]
   - 使用 CloudBase MCP 工具 \`queryFunctions(action="listFunctionLogs")\` 获取日志列表
   - 使用 \`queryFunctions(action="getFunctionLogDetail")\` 获取详细错误信息

2. **分析错误原因**：
   - 分析错误堆栈和错误消息
   - 参考 \`cloudbase-platform\` 规则了解常见错误和解决方案
   - 识别根本原因（代码问题、配置问题、依赖问题等）

3. **提供修复方案**：
   - 提供具体的代码修改建议
   - 使用 \`manageFunctions(action="updateFunctionCode")\` 更新函数代码
   - 普通代码修复优先传 \`functionRootPath\`，不要默认先压缩 zip
   - 验证修复结果

请帮我分析和修复这个函数错误。`
  }
};

// Export for use in panel.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SCENARIO_CONFIG;
}

