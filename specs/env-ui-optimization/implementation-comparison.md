# 实现方案详细对比

## 方案对比总结

| 特性 | 方案 A2: TS 常量 | 方案 A1: Express Static |
|------|------------------|-------------------------|
| **文件类型** | TypeScript 字符串 | 独立 HTML/CSS/JS |
| **编译需求** | 随 webpack 一起编译 | 需要配置文件复制 |
| **开发体验** | 有限的语法高亮 | 完整的代码提示 |
| **调试难度** | 中等（仍在字符串中） | 简单（可直接调试） |
| **热更新** | 需要重新编译 | 可以直接刷新 |
| **架构清晰度** | 中等（仍混合） | 高（前后端分离） |

---

## 方案 A2: TypeScript 常量文件

### 目录结构
```
mcp/src/
├── interactive-server.ts          # 主服务器
└── templates/
    └── env-setup/
        ├── index.ts               # 导出组合函数
        ├── template.ts            # HTML 字符串
        ├── styles.ts              # CSS 字符串
        └── script.ts              # JS 字符串
```

### 实现示例

**templates/env-setup/template.ts:**
```typescript
export const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase AI Toolkit - 环境配置</title>
    {{CSS}}
</head>
<body>
    <div class="modal">
        {{CONTENT}}
    </div>
    {{JS}}
</body>
</html>
`;

export const CONTENT_TEMPLATE = `
<div class="header">
    <div class="header-left">
        <img class="logo" src="{{LOGO_URL}}" alt="CloudBase Logo" />
        <span class="title">CloudBase AI Toolkit</span>
    </div>
    <div class="header-right">
        {{ACCOUNT_INFO}}
    </div>
</div>
<div class="content">
    <h1 class="content-title">选择 CloudBase 环境</h1>
    {{SEARCH_BOX}}
    {{ENV_LIST}}
    {{ACTIONS}}
</div>
`;
```

**templates/env-setup/styles.ts:**
```typescript
export const CSS_STYLES = `
<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
        --primary-color: #1a1a1a;
        --accent-color: #67E9E9;
        --text-primary: #ffffff;
        --text-secondary: #a0a0a0;
        --border-color: rgba(255, 255, 255, 0.15);
        --font-mono: 'JetBrains Mono', monospace;
    }
    
    body {
        font-family: var(--font-mono);
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }
    
    /* 更多样式... */
</style>
`;
```

**templates/env-setup/script.ts:**
```typescript
export const JS_SCRIPT = `
<script>
    let selectedEnvId = null;
    
    function selectEnv(envId, element) {
        selectedEnvId = envId;
        document.querySelectorAll('.env-item').forEach(item => {
            item.classList.remove('selected');
        });
        element.classList.add('selected');
        document.getElementById('confirmBtn').disabled = false;
    }
    
    function filterEnvs(searchTerm) {
        const items = document.querySelectorAll('.env-item');
        items.forEach(item => {
            const name = item.querySelector('.env-name').textContent.toLowerCase();
            const id = item.querySelector('.env-id').textContent.toLowerCase();
            const match = name.includes(searchTerm.toLowerCase()) || 
                         id.includes(searchTerm.toLowerCase());
            item.style.display = match ? 'flex' : 'none';
        });
    }
    
    // WebSocket 连接
    const ws = new WebSocket('ws://localhost:{{PORT}}');
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
    };
</script>
`;
```

**templates/env-setup/index.ts:**
```typescript
import { HTML_TEMPLATE, CONTENT_TEMPLATE } from './template.js';
import { CSS_STYLES } from './styles.js';
import { JS_SCRIPT } from './script.js';

export function renderEnvSetupPage(options: {
  envs?: any[];
  accountInfo?: { uin?: string };
  port: number;
}): string {
  const { envs = [], accountInfo, port } = options;
  
  // 渲染环境列表
  const envListHTML = envs.map((env, index) => `
    <div class="env-item" onclick="selectEnv('${env.EnvId}', this)">
      <div class="env-info">
        <div class="env-name">${env.Alias || '无别名'}</div>
        <div class="env-id">${env.EnvId}</div>
      </div>
    </div>
  `).join('');
  
  // 组装内容
  let content = CONTENT_TEMPLATE
    .replace('{{ACCOUNT_INFO}}', accountInfo?.uin ? `UIN: ${accountInfo.uin}` : '')
    .replace('{{ENV_LIST}}', envListHTML);
  
  // 组装最终 HTML
  return HTML_TEMPLATE
    .replace('{{CSS}}', CSS_STYLES)
    .replace('{{CONTENT}}', content)
    .replace('{{JS}}', JS_SCRIPT.replace('{{PORT}}', String(port)));
}
```

**interactive-server.ts 使用：**
```typescript
import { renderEnvSetupPage } from './templates/env-setup/index.js';

class InteractiveServer {
  private getEnvSetupHTML(envs?: any[], accountInfo?: any): string {
    return renderEnvSetupPage({
      envs,
      accountInfo,
      port: this.port,
    });
  }
}
```

### 编译流程
```bash
# 无需额外配置，webpack 自动处理
npm run build
```

**优点：**
✅ 零配置 - 不需要修改 webpack
✅ 快速实施 - 重构代码即可
✅ 类型安全 - 仍在 TS 环境中

**缺点：**
❌ 仍是字符串 - CSS/JS 缺少完整代码提示
❌ 调试困难 - 无法在浏览器中直接调试源码

---

## 方案 A1: Express Static（推荐 ⭐）

### 目录结构
```
mcp/
├── src/
│   ├── interactive-server.ts      # Express 服务器
│   └── templates/
│       └── env-setup/
│           └── renderer.ts        # 服务端渲染逻辑
└── static/                         # 静态文件（源码）
    └── env-setup/
        ├── index.html
        ├── styles.css
        └── script.js
```

### 实现示例

**static/env-setup/index.html:**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase AI Toolkit - 环境配置</title>
    <link rel="stylesheet" href="/static/env-setup/styles.css">
</head>
<body>
    <div class="modal">
        <div class="header">
            <div class="header-left">
                <img class="logo" src="https://example.com/logo.svg" alt="Logo" />
                <span class="title">CloudBase AI Toolkit</span>
            </div>
            <div class="header-right" id="accountInfo"></div>
        </div>
        <div class="content">
            <h1 class="content-title">选择 CloudBase 环境</h1>
            
            <!-- 搜索框 -->
            <div class="search-box">
                <input 
                    type="text" 
                    id="searchInput" 
                    class="search-input" 
                    placeholder="搜索环境名称或 ID..."
                    oninput="filterEnvs(this.value)"
                />
                <button class="search-clear" onclick="clearSearch()">×</button>
            </div>
            
            <!-- 环境列表 -->
            <div class="env-list" id="envList"></div>
            
            <!-- 无结果提示 -->
            <div class="empty-state" id="noResults" style="display: none;">
                <p>未找到匹配的环境</p>
            </div>
            
            <!-- 操作按钮 -->
            <div class="actions">
                <button class="btn btn-secondary" onclick="cancel()">取消</button>
                <button class="btn btn-primary" id="confirmBtn" onclick="confirm()" disabled>
                    确认选择
                </button>
            </div>
            
            <!-- 新建环境按钮 -->
            <div class="footer-actions">
                <button class="btn btn-create" onclick="createNewEnv()">
                    + 新建环境
                </button>
            </div>
            
            <!-- 帮助链接 -->
            <div class="help-links">
                <a href="https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/" target="_blank">
                    📚 帮助文档
                </a>
                <a href="https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials" target="_blank">
                    🎬 视频教程
                </a>
            </div>
        </div>
    </div>
    
    <script src="/static/env-setup/script.js"></script>
    <script>
        // 初始化：从服务器获取数据
        initEnvSetup();
    </script>
</body>
</html>
```

**static/env-setup/styles.css:**
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --primary-color: #1a1a1a;
    --accent-color: #67E9E9;
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
    --border-color: rgba(255, 255, 255, 0.15);
    --font-mono: 'JetBrains Mono', monospace;
}

body {
    font-family: var(--font-mono);
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

/* 搜索框 */
.search-box {
    margin-bottom: 20px;
    position: relative;
}

.search-input {
    width: 100%;
    padding: 12px 40px 12px 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-primary);
    font-size: 14px;
    font-family: var(--font-mono);
}

.search-clear {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 20px;
}

/* 环境卡片 */
.env-item {
    padding: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.env-item:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--accent-color);
}

.env-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
}

.env-id {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
}

/* 帮助链接 */
.help-links {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border-color);
}

.help-links a {
    color: var(--accent-color);
    text-decoration: none;
    font-size: 14px;
    transition: opacity 0.3s ease;
}

.help-links a:hover {
    opacity: 0.8;
}

/* 更多样式... */
```

**static/env-setup/script.js:**
```javascript
let selectedEnvId = null;
let ws = null;

// 初始化
async function initEnvSetup() {
    try {
        // 1. 从 API 获取初始数据
        const response = await fetch('/api/env-setup/init');
        const data = await response.json();
        
        // 2. 渲染账号信息
        renderAccountInfo(data.accountInfo);
        
        // 3. 渲染环境列表
        renderEnvList(data.envs);
        
        // 4. 建立 WebSocket 连接
        connectWebSocket();
    } catch (error) {
        console.error('初始化失败:', error);
    }
}

// 渲染账号信息
function renderAccountInfo(accountInfo) {
    if (!accountInfo?.uin) return;
    
    const container = document.getElementById('accountInfo');
    container.innerHTML = `
        <div class="account-info-compact">
            <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>UIN: ${accountInfo.uin}</span>
        </div>
        <button class="btn-icon" onclick="switchAccount()">
            <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <path d="M20 8v6M23 11h-6"/>
            </svg>
        </button>
    `;
}

// 渲染环境列表
function renderEnvList(envs) {
    const container = document.getElementById('envList');
    
    if (!envs || envs.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无环境</div>';
        return;
    }
    
    container.innerHTML = envs.map(env => `
        <div class="env-item" onclick="selectEnv('${env.EnvId}', this)">
            <div class="env-info">
                <div class="env-name">${env.Alias || '无别名'}</div>
                <div class="env-id">${env.EnvId}</div>
            </div>
        </div>
    `).join('');
}

// 选择环境
function selectEnv(envId, element) {
    selectedEnvId = envId;
    
    // 移除其他选中状态
    document.querySelectorAll('.env-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // 添加选中状态
    element.classList.add('selected');
    
    // 启用确认按钮
    document.getElementById('confirmBtn').disabled = false;
}

// 搜索过滤
function filterEnvs(searchTerm) {
    const items = document.querySelectorAll('.env-item');
    let visibleCount = 0;
    
    items.forEach(item => {
        const name = item.querySelector('.env-name').textContent.toLowerCase();
        const id = item.querySelector('.env-id').textContent.toLowerCase();
        const match = name.includes(searchTerm.toLowerCase()) || 
                     id.includes(searchTerm.toLowerCase());
        
        item.style.display = match ? 'flex' : 'none';
        if (match) visibleCount++;
    });
    
    // 显示/隐藏无结果提示
    document.getElementById('noResults').style.display = 
        visibleCount === 0 ? 'block' : 'none';
}

// 清除搜索
function clearSearch() {
    document.getElementById('searchInput').value = '';
    filterEnvs('');
}

// WebSocket 连接
function connectWebSocket() {
    ws = new WebSocket(`ws://${location.host}`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// 处理 WebSocket 消息
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'envUpdate':
            renderEnvList(data.envs);
            break;
        // 更多消息类型...
    }
}

// 确认选择
function confirm() {
    if (!selectedEnvId) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'confirm',
            envId: selectedEnvId
        }));
    }
}

// 取消
function cancel() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'cancel'
        }));
    }
}

// 切换账号
function switchAccount() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'switchAccount'
        }));
    }
}

// 新建环境
function createNewEnv() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'createEnv'
        }));
    }
}
```

**src/interactive-server.ts (后端):**
```typescript
import express from 'express';
import path from 'path';
import { WebSocketServer } from 'ws';

class InteractiveServer {
  private app: express.Application;
  
  constructor() {
    this.app = express();
    this.setupStaticFiles();
    this.setupAPI();
  }
  
  // 配置静态文件服务
  private setupStaticFiles() {
    const staticPath = path.join(__dirname, '../static');
    this.app.use('/static', express.static(staticPath));
    
    // 环境选择页面路由
    this.app.get('/env-setup', (req, res) => {
      res.sendFile(path.join(staticPath, 'env-setup/index.html'));
    });
  }
  
  // 配置 API 接口
  private setupAPI() {
    // 获取初始数据
    this.app.get('/api/env-setup/init', async (req, res) => {
      try {
        const envs = await this.getEnvironments();
        const accountInfo = await this.getAccountInfo();
        
        res.json({
          success: true,
          envs,
          accountInfo
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }
  
  // WebSocket 处理
  private setupWebSocket() {
    const wss = new WebSocketServer({ server: this.server });
    
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'confirm':
            this.handleEnvConfirm(message.envId);
            break;
          case 'cancel':
            this.handleCancel();
            break;
          case 'switchAccount':
            this.handleSwitchAccount();
            break;
          case 'createEnv':
            this.handleCreateEnv();
            break;
        }
      });
    });
  }
}
```

### Webpack 配置

**webpack/index.cjs 添加：**
```javascript
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  // ... 现有配置
  
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'static',
          to: 'static',
          noErrorOnMissing: true
        }
      ]
    })
  ]
};
```

### 编译流程
```bash
# 1. 安装依赖
npm install copy-webpack-plugin --save-dev

# 2. 构建
npm run build

# 输出目录结构：
# dist/
# ├── index.cjs
# └── static/
#     └── env-setup/
#         ├── index.html
#         ├── styles.css
#         └── script.js
```

### 优点
✅ **完全分离** - HTML/CSS/JS 独立文件
✅ **开发体验好** - 完整的代码提示和高亮
✅ **易于调试** - 可在浏览器中直接调试
✅ **前后端分离** - 通过 API 通信
✅ **易于协作** - 前端工程师可直接修改
✅ **热更新友好** - 修改静态文件可直接刷新

### 缺点
⚠️ **需要配置** - 需要配置 webpack 插件
⚠️ **略微复杂** - 需要维护 API 接口

---

## 最终建议

**强烈推荐方案 A1：Express Static** ⭐⭐⭐⭐⭐

**理由：**
1. ✅ **真正的前后端分离** - 符合现代 Web 开发最佳实践
2. ✅ **开发体验最佳** - HTML/CSS/JS 独立文件，完整代码提示
3. ✅ **易于调试和维护** - 可直接在浏览器调试
4. ✅ **扩展性强** - 未来添加更多页面很容易
5. ✅ **配置简单** - 只需添加一个 webpack 插件

**实施成本：**
- Webpack 配置：10 分钟
- 代码重构：2-3 小时
- 测试验证：30 分钟
- **总计：3-4 小时**

**我建议立即开始实施方案 A1，需要我开始吗？**








