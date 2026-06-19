// AI Dev Panel JavaScript

// IDE configurations - only CodeBuddy
const IDES = [
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    platform: 'VS Code、JetBrains、微信开发者工具',
    iconUrl: 'https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "CodeBuddyManual"
      }
    }
  }
}`,
    configPath: '.codebuddy/mcp.json'
  }
];

// Load scenario configurations
let PROMPT_TEMPLATES = {};

// Load scenarios from scenarios.js if available
if (typeof SCENARIO_CONFIG !== 'undefined') {
  Object.keys(SCENARIO_CONFIG).forEach(key => {
    PROMPT_TEMPLATES[key] = SCENARIO_CONFIG[key].promptTemplate;
  });
} else {
  // Fallback templates
  PROMPT_TEMPLATES = {
    'create-database-table': `我正在使用云开发平台的MySQL数据库创建数据表，需要你的帮助：

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

请帮我完成从表设计到代码生成的完整流程。`,
    
    'create-cloud-function': `我需要创建一个云函数，但不知道如何编写代码和配置。请帮助我：

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

请帮我完成云函数的创建和集成。`,
    
    'integrate-auth': `我看到云开发平台提供了身份认证功能，但不知道如何集成到我的项目中。请帮助我：

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

请帮我完成登录功能的集成。`,
    
    'analyze-function-error': `我的云函数出现了错误，需要你的帮助分析和修复：

1. **获取错误日志**：
   - 函数名称：[系统自动填充或用户填写]
   - 错误时间：[系统自动填充]
   - 使用 CloudBase MCP 工具 \`getFunctionLogs\` 获取日志列表
   - 使用 \`getFunctionLogDetail\` 获取详细错误信息

2. **分析错误原因**：
   - 分析错误堆栈和错误消息
   - 参考 \`cloudbase-platform\` 规则了解常见错误和解决方案
   - 识别根本原因（代码问题、配置问题、依赖问题等）

3. **提供修复方案**：
   - 提供具体的代码修改建议
   - 使用 \`updateFunctionCode\` 更新函数代码
   - 验证修复结果

请帮我分析和修复这个函数错误。`
  };
}

// Initialize AI Dev Panel
function initAIDevPanel(scenarioId) {
  const button = document.querySelector(`[data-scenario="${scenarioId}"]`);
  
  if (!button) return;
  
  // Create overlay and panel if they don't exist
  let overlay = document.getElementById(`ai-dev-overlay-${scenarioId}`);
  let panel = document.getElementById(`ai-dev-panel-${scenarioId}`);
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = `ai-dev-overlay-${scenarioId}`;
    overlay.className = 'ai-dev-overlay';
    document.body.appendChild(overlay);
  }
  
  if (!panel) {
    panel = document.createElement('div');
    panel.id = `ai-dev-panel-${scenarioId}`;
    panel.className = 'ai-dev-panel';
    panel.setAttribute('data-panel', scenarioId);
    document.body.appendChild(panel);
  }
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isOpen = panel.classList.contains('show');
    
    if (isOpen) {
      closePanel(scenarioId);
    } else {
      openPanel(scenarioId);
    }
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePanel(scenarioId);
    }
  });
  
  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('show')) {
      closePanel(scenarioId);
    }
  });
}

function openPanel(scenarioId) {
  const overlay = document.getElementById(`ai-dev-overlay-${scenarioId}`);
  const panel = document.getElementById(`ai-dev-panel-${scenarioId}`);
  
  if (!overlay || !panel) return;
  
  renderPanel(scenarioId, panel);
  overlay.classList.add('show');
  panel.classList.add('show');
  document.body.style.overflow = 'hidden'; // Prevent body scroll
}

function closePanel(scenarioId) {
  const overlay = document.getElementById(`ai-dev-overlay-${scenarioId}`);
  const panel = document.getElementById(`ai-dev-panel-${scenarioId}`);
  
  if (!overlay || !panel) return;
  
  overlay.classList.remove('show');
  panel.classList.remove('show');
  document.body.style.overflow = ''; // Restore body scroll
}

// Render panel content
function renderPanel(scenarioId, panelElement) {
  const selectedIDE = IDES[0]; // Default to CodeBuddy
  const promptTemplate = PROMPT_TEMPLATES[scenarioId] || '';
  
  panelElement.innerHTML = `
    <div class="ai-dev-panel-header">
      <h2 class="ai-dev-panel-title">使用 AI 开发</h2>
      <button class="ai-dev-panel-close" onclick="closePanel('${scenarioId}')" aria-label="关闭">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    <div class="ai-dev-panel-body">
      <div class="ide-selector">
        <div class="ide-selector-header">
          <span class="ide-selector-label">AI IDE：</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${selectedIDE.iconUrl ? `<img src="${selectedIDE.iconUrl}" alt="${selectedIDE.name}" class="ide-selector-item-icon" style="width: 18px; height: 18px;">` : ''}
            <span>${selectedIDE.name}</span>
          </div>
        </div>
      </div>
      
      <div class="mcp-config-steps">
        <div class="mcp-config-steps-title">MCP 配置步骤</div>
        <div class="mcp-config-step">
          <div class="mcp-config-step-title">步骤 1：创建配置文件</div>
          <div class="mcp-config-step-content">
            在项目根目录创建 <code>${selectedIDE.configPath}</code> 文件
          </div>
        </div>
        <div class="mcp-config-step">
          <div class="mcp-config-step-title">步骤 2：添加配置内容</div>
          <div class="mcp-config-step-content">
            <div class="mcp-config-code">${selectedIDE.configExample}</div>
            <button class="mcp-config-copy-button" onclick="copyConfig('${scenarioId}')">复制配置</button>
          </div>
        </div>
        <div class="mcp-config-step">
          <div class="mcp-config-step-title">步骤 3：重启 IDE</div>
          <div class="mcp-config-step-content">
            重启你的 IDE，MCP 服务器将自动连接
          </div>
        </div>
      </div>
      
      <div class="prompt-editor">
        <div class="prompt-editor-label">
          <span class="prompt-editor-label-text">场景化提示词（可编辑）</span>
          <div class="prompt-editor-actions">
            <button class="prompt-editor-button" onclick="resetPrompt('${scenarioId}')">重置</button>
            <button class="prompt-editor-button primary" onclick="copyPrompt('${scenarioId}')">复制提示词</button>
          </div>
        </div>
        <textarea class="prompt-editor-textarea" id="prompt-${scenarioId}">${promptTemplate}</textarea>
      </div>
    </div>
  `;
}


// Copy config
function copyConfig(scenarioId) {
  const configCode = document.querySelector(`[data-panel="${scenarioId}"] .mcp-config-code`);
  if (configCode) {
    navigator.clipboard.writeText(configCode.textContent).then(() => {
      alert('配置已复制到剪贴板！');
    });
  }
}

// Copy prompt
function copyPrompt(scenarioId) {
  const promptTextarea = document.getElementById(`prompt-${scenarioId}`);
  if (promptTextarea) {
    navigator.clipboard.writeText(promptTextarea.value).then(() => {
      alert('提示词已复制到剪贴板！');
    });
  }
}

// Reset prompt
function resetPrompt(scenarioId) {
  const promptTextarea = document.getElementById(`prompt-${scenarioId}`);
  const originalPrompt = PROMPT_TEMPLATES[scenarioId] || '';
  if (promptTextarea) {
    promptTextarea.value = originalPrompt;
  }
}

// Initialize all panels on page load
document.addEventListener('DOMContentLoaded', () => {
  // Load scenarios.js first if available
  const script = document.createElement('script');
  script.src = 'js/scenarios.js';
  script.onload = () => {
    const scenarios = ['create-database-table', 'create-cloud-function', 'integrate-auth', 'analyze-function-error'];
    scenarios.forEach(scenarioId => {
      initAIDevPanel(scenarioId);
    });
  };
  script.onerror = () => {
    // Fallback if scenarios.js is not available
    const scenarios = ['create-database-table', 'create-cloud-function', 'integrate-auth', 'analyze-function-error'];
    scenarios.forEach(scenarioId => {
      initAIDevPanel(scenarioId);
    });
  };
  document.head.appendChild(script);
});

