# 需求文档 - Python云函数部署支持

## 介绍

用户希望通过AI和MCP工具批量部署本地的Python云函数,但目前MCP的`createFunction`接口仅支持Node.js运行时环境,对于Python、PHP、Java、Go等其他语言的支持被限制了。

根据CloudBase Manager Node SDK官方文档,云函数支持多种运行时环境:

- **HTTP函数**: 已支持所有语言(通过scf_bootstrap启动脚本实现),无需指定runtime参数
- **Event函数**: 官方文档显示支持以下运行时,但需要实际验证:
  - **Node.js**: Nodejs20.19, Nodejs18.15, Nodejs16.13等
  - **Python**: Python3.10, Python3.9, Python3.7, Python3.6, Python2.7
  - **PHP**: Php8.0, Php7.4, Php7.2
  - **Java**: Java8, Java11
  - **Golang**: Golang1

本需求旨在移除MCP工具中对Event函数运行时环境的不必要限制,并在实际验证后,实现Python等多语言云函数的一键部署。

## 需求

### 需求 1 - 移除运行时环境限制

**用户故事:** 作为开发者,我希望能够通过MCP工具直接部署本地的Python云函数,就像部署Node.js函数一样简单,无需额外配置。

#### 验收标准

1. When 用户调用`createFunction`工具并指定`runtime`为Python运行时(如`Python3.9`),the MCP工具 shall 接受该参数并成功创建Event函数。

2. When 用户调用`createFunction`工具并指定`runtime`为PHP/Java/Go运行时,the MCP工具 shall 接受该参数并成功创建Event函数。

3. When 用户未指定`runtime`参数,the MCP工具 shall 使用默认的Nodejs18.15运行时,并在返回信息中提示用户可以通过指定runtime参数来使用其他语言。

4. When 用户指定了不支持的运行时,the MCP工具 shall 返回清晰的错误提示,列出所有支持的运行时版本(按语言分类)。

### 需求 2 - AI友好的错误提示和引导

**用户故事:** 作为AI助手,当用户尝试部署非Node.js函数时,我希望能够获得清晰的错误提示和解决方案建议,以便正确引导用户完成部署。

#### 验收标准

1. When 用户指定了不支持的运行时版本,the MCP工具 shall 返回友好的错误提示,列出所有支持的运行时环境和版本(按语言分类)。

2. When 使用默认运行时时,the MCP工具 shall 在返回信息中提示用户可以指定其他runtime参数。

3. When Python/PHP/Java/Go函数缺少依赖时,the MCP工具 shall 给出打包依赖的提示和指南链接。

4. When 部署失败时,the MCP工具 shall 返回详细的错误信息,包括可能的原因和解决建议。

5. When 用户尝试修改已存在函数的运行时,the MCP工具 shall 明确提示运行时不可修改,需要删除后重新创建。

### 需求 3 - 文档和规则更新

**用户故事:** 作为开发者和AI助手,我希望能够通过文档和规则文件了解如何正确使用MCP工具部署多语言云函数。

#### 验收标准

1. When 功能开发完成后,the 文档 shall 更新`doc/mcp-tools.md`,添加Event函数支持的所有运行时列表,并说明HTTP函数已支持所有语言。

2. When 功能开发完成后,the 规则文件 shall 更新`config/rules/cloud-functions/rule.md`,添加多语言支持说明和各语言的依赖打包指南。

3. When 功能开发完成后,the 文档 shall 包含Python、PHP、Java、Go云函数的完整示例(Event函数和HTTP函数)。

4. When 用户指定了不支持的运行时,the MCP工具 shall 返回清晰的错误提示,列出所有支持的运行时环境。

## 技术约束

1. **运行时版本**: 必须与CloudBase Manager Node SDK支持的运行时版本保持一致
2. **向后兼容**: 不能影响现有Node.js Event函数的部署流程
3. **依赖安装**:
   - Node.js函数会自动安装依赖(MCP工具强制开启`installDependency=true`)
   - Python/PHP/Java/Go函数需要预先打包依赖到函数目录
   - 需要在文档中提供各语言的依赖打包指南
4. **函数入口**: 不同语言的函数入口格式不同,需要在文档中明确说明
5. **Event函数多语言支持验证**: 需要先验证Event函数是否真的支持Python/PHP/Java/Go,如果不支持,需要调整方案为引导用户使用HTTP函数

## 优先级

**高优先级** - 此功能直接影响用户体验和产品的多语言支持能力,应优先实现。

## 相关资源

- CloudBase Manager Node SDK - createFunction API: https://docs.cloudbase.net/api-reference/manager/node/function#createfunction
- 支持的运行时环境列表: Nodejs20.19, Nodejs18.15, Php8.0, Php7.4, Python3.10, Python3.9, Python3.7, Golang1, Java8, Java11
- 现有MCP函数工具实现: `mcp/src/tools/functions.ts`

