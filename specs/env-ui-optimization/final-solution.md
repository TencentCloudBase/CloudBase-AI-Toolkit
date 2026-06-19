# 最终方案：优化的内联模板方案

## 核心约束

**必须满足：**
✅ 最终产物是单个 bundle 文件（`dist/index.cjs`）
✅ 不依赖外部静态文件
✅ 部署简单（单文件分发）

**希望改善：**
✅ 代码可维护性
✅ 开发体验
✅ 逻辑清晰度

---

## 最终方案：模块化的 TS 模板常量

### 目录结构

```
mcp/src/
├── interactive-server.ts          # 主服务器类
└── templates/
    └── env-setup/
        ├── index.ts               # 主渲染函数（导出）
        ├── html.ts                # HTML 结构
        ├── styles.ts              # CSS 样式
        ├── scripts.ts             # JavaScript 逻辑
        └── components.ts          # 可复用组件片段
```

### 实现示例

#### 1. `templates/env-setup/components.ts` - 可复用组件

```typescript
/**
 * Reusable UI components for env setup page
 */

export function renderHeader(accountInfo?: { uin?: string }) {
  const hasAccount = !!accountInfo?.uin;
  
  return `
    <div class="header">
      <div class="header-left">
        <img class="logo" src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/cloudbase-logo.svg" alt="CloudBase Logo" />
        <span class="title">CloudBase AI Toolkit</span>
      </div>
      <div class="header-right">
        ${hasAccount ? `
          <div class="account-info-compact">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>UIN: ${accountInfo.uin}</span>
          </div>
          <button class="btn-icon" onclick="switchAccount()" title="切换账号">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <path d="M20 8v6M23 11h-6"/>
            </svg>
          </button>
        ` : ''}
        <a href="https://github.com/TencentCloudBase/CloudBase-AI-ToolKit" target="_blank" class="btn-icon" title="GitHub">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    </div>
  `;
}

export function renderSearchBox() {
  return `
    <div class="search-box">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input 
        type="text" 
        id="searchInput" 
        class="search-input" 
        placeholder="搜索环境名称或 ID..."
        oninput="filterEnvs(this.value)"
      />
      <button class="search-clear" onclick="clearSearch()" id="searchClear" style="display: none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;
}

export function renderEnvItem(env: any, index: number) {
  const alias = env.Alias || '无别名';
  const envId = env.EnvId;
  
  return `
    <div class="env-item" onclick="selectEnv('${envId}', this)" style="animation-delay: ${index * 0.05}s;">
      <svg class="env-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      <div class="env-info">
        <div class="env-name">${alias}</div>
        <div class="env-id">${envId}</div>
      </div>
    </div>
  `;
}

export function renderEmptyState(hasInitError: boolean) {
  return `
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      <h3 class="empty-title">暂无 CloudBase 环境</h3>
      ${hasInitError ? `
        <p class="empty-message">由于 CloudBase 服务初始化失败，无法创建新环境。请先解决初始化问题后重试。</p>
      ` : `
        <p class="empty-message">当前没有可用的 CloudBase 环境</p>
      `}
    </div>
  `;
}

export function renderHelpLinks() {
  return `
    <div class="help-links">
      <a href="https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/" target="_blank" class="help-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        帮助文档
      </a>
      <a href="https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials" target="_blank" class="help-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        视频教程
      </a>
    </div>
  `;
}

export function renderActionButtons(hasEnvs: boolean, hasInitError: boolean) {
  return `
    <div class="actions">
      <button class="btn btn-secondary" onclick="cancel()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        取消
      </button>
      <button class="btn btn-primary" id="confirmBtn" onclick="confirm()" disabled>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        确认选择
      </button>
    </div>
    
    ${!hasInitError ? `
      <div class="footer-actions">
        <button class="btn btn-create" onclick="createNewEnv()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          新建环境
        </button>
      </div>
    ` : ''}
  `;
}
```

#### 2. `templates/env-setup/styles.ts` - CSS 样式

```typescript
/**
 * CSS styles for env setup page
 */

export const CSS_STYLES = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  :root {
    --primary-color: #1a1a1a;
    --accent-color: #67E9E9;
    --accent-hover: #2BCCCC;
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
    --border-color: rgba(255, 255, 255, 0.15);
    --bg-secondary: rgba(255, 255, 255, 0.08);
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

  /* Search box styles */
  .search-box {
    position: relative;
    margin-bottom: 20px;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 12px 40px 12px 40px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-primary);
    font-size: 14px;
    font-family: var(--font-mono);
    transition: all 0.3s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-color);
    background: rgba(255, 255, 255, 0.12);
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
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.3s ease;
  }

  .search-clear:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.1);
  }

  /* Env item styles */
  .env-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    animation: fadeInUp 0.5s ease-out both;
  }

  .env-item:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: var(--accent-color);
    transform: translateX(4px);
  }

  .env-item.selected {
    background: rgba(103, 233, 233, 0.15);
    border-color: var(--accent-color);
    box-shadow: 0 0 20px rgba(103, 233, 233, 0.3);
  }

  .env-icon {
    width: 24px;
    height: 24px;
    color: var(--accent-color);
    flex-shrink: 0;
  }

  .env-info {
    flex: 1;
    min-width: 0;
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
    word-break: break-all;
  }

  /* Header right styles */
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .account-info-compact {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.3s ease;
    text-decoration: none;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--accent-color);
  }

  /* Help links */
  .help-links {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border-color);
  }

  .help-link {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-color);
    text-decoration: none;
    font-size: 14px;
    padding: 6px 12px;
    border-radius: 8px;
    transition: all 0.3s ease;
  }

  .help-link:hover {
    background: rgba(103, 233, 233, 0.1);
  }

  /* Footer actions */
  .footer-actions {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .btn-create {
    width: 100%;
    padding: 14px;
    background: rgba(103, 233, 233, 0.1);
    border: 1px dashed var(--accent-color);
    color: var(--accent-color);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 12px;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-create:hover {
    background: rgba(103, 233, 233, 0.2);
    border-style: solid;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ... 更多现有样式 ... */
</style>
`;
```

#### 3. `templates/env-setup/scripts.ts` - JavaScript 逻辑

```typescript
/**
 * JavaScript logic for env setup page
 */

export const JS_SCRIPTS = `
<script>
  let selectedEnvId = null;

  // Select environment
  function selectEnv(envId, element) {
    selectedEnvId = envId;
    
    // Remove selected class from all items
    document.querySelectorAll('.env-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    // Add selected class to current item
    element.classList.add('selected');
    
    // Enable confirm button
    document.getElementById('confirmBtn').disabled = false;
  }

  // Filter environments
  function filterEnvs(searchTerm) {
    const items = document.querySelectorAll('.env-item');
    const searchClear = document.getElementById('searchClear');
    let visibleCount = 0;
    
    items.forEach(item => {
      const name = item.querySelector('.env-name').textContent.toLowerCase();
      const id = item.querySelector('.env-id').textContent.toLowerCase();
      const match = name.includes(searchTerm.toLowerCase()) || 
                   id.includes(searchTerm.toLowerCase());
      
      item.style.display = match ? 'flex' : 'none';
      if (match) visibleCount++;
    });
    
    // Show/hide clear button
    searchClear.style.display = searchTerm ? 'flex' : 'none';
    
    // Show/hide no results message
    const noResults = document.getElementById('noResults');
    if (noResults) {
      noResults.style.display = visibleCount === 0 && items.length > 0 ? 'block' : 'none';
    }
  }

  // Clear search
  function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    filterEnvs('');
    searchInput.focus();
  }

  // WebSocket connection
  const ws = new WebSocket('ws://localhost:{{WS_PORT}}');
  
  ws.onopen = () => {
    console.log('WebSocket connected');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);
  };

  // Confirm selection
  function confirm() {
    if (!selectedEnvId) return;
    
    document.getElementById('loading').style.display = 'flex';
    
    ws.send(JSON.stringify({
      type: 'confirm',
      envId: selectedEnvId
    }));
  }

  // Cancel
  function cancel() {
    ws.send(JSON.stringify({
      type: 'cancel'
    }));
  }

  // Switch account
  function switchAccount() {
    ws.send(JSON.stringify({
      type: 'switchAccount'
    }));
  }

  // Create new environment
  function createNewEnv() {
    ws.send(JSON.stringify({
      type: 'createEnv'
    }));
  }
</script>
`;
```

#### 4. `templates/env-setup/html.ts` - HTML 结构

```typescript
/**
 * HTML template structure
 */

export function HTML_TEMPLATE(css: string, body: string, scripts: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase AI Toolkit - 环境配置</title>
    ${css}
</head>
<body>
    ${body}
    ${scripts}
</body>
</html>
  `.trim();
}
```

#### 5. `templates/env-setup/index.ts` - 主渲染函数

```typescript
/**
 * Main renderer for env setup page
 */

import { HTML_TEMPLATE } from './html.js';
import { CSS_STYLES } from './styles.js';
import { JS_SCRIPTS } from './scripts.js';
import {
  renderHeader,
  renderSearchBox,
  renderEnvItem,
  renderEmptyState,
  renderHelpLinks,
  renderActionButtons
} from './components.js';

export interface EnvSetupOptions {
  envs?: any[];
  accountInfo?: { uin?: string };
  errorContext?: any;
  sessionId?: string;
  wsPort: number;
}

export function renderEnvSetupPage(options: EnvSetupOptions): string {
  const { envs = [], accountInfo, errorContext, wsPort } = options;
  
  const hasEnvs = envs.length > 0;
  const hasInitError = !!errorContext?.initTcbError;
  
  // Build env list HTML
  let envListHTML = '';
  if (hasEnvs) {
    envListHTML = `
      ${renderSearchBox()}
      <div class="env-list" id="envList">
        ${envs.map((env, index) => renderEnvItem(env, index)).join('')}
      </div>
      <div id="noResults" style="display: none;" class="empty-state">
        <p>未找到匹配的环境</p>
      </div>
    `;
  } else {
    envListHTML = renderEmptyState(hasInitError);
  }
  
  // Build body HTML
  const bodyHTML = `
    <div class="modal">
      ${renderHeader(accountInfo)}
      <div class="content">
        <h1 class="content-title">选择 CloudBase 环境</h1>
        ${envListHTML}
        ${renderActionButtons(hasEnvs, hasInitError)}
        ${renderHelpLinks()}
        
        <div class="loading" id="loading" style="display: none;">
          <div class="spinner"></div>
          <span>正在配置环境...</span>
        </div>
      </div>
    </div>
  `;
  
  // Inject WebSocket port
  const scripts = JS_SCRIPTS.replace('{{WS_PORT}}', String(wsPort));
  
  // Assemble final HTML
  return HTML_TEMPLATE(CSS_STYLES, bodyHTML, scripts);
}
```

#### 6. `interactive-server.ts` - 使用

```typescript
import { renderEnvSetupPage } from './templates/env-setup/index.js';

class InteractiveServer {
  private getEnvSetupHTML(
    envs?: any[],
    accountInfo?: { uin?: string },
    errorContext?: any,
    sessionId?: string
  ): string {
    return renderEnvSetupPage({
      envs,
      accountInfo,
      errorContext,
      sessionId,
      wsPort: this.port
    });
  }
}
```

---

## 优势总结

### ✅ 满足约束
- **单文件 bundle** - 所有代码编译进 `dist/index.cjs`
- **零外部依赖** - 不需要静态文件目录
- **简单部署** - 单文件分发即可

### ✅ 提升体验
- **代码分离** - HTML/CSS/JS 逻辑分开
- **组件化** - 可复用的组件函数
- **类型安全** - 完整的 TypeScript 支持
- **易于维护** - 清晰的文件组织

### ✅ 开发友好
- **语法高亮** - 模板字符串有基本高亮
- **代码提示** - 函数参数有完整类型提示
- **逻辑清晰** - 每个文件职责单一
- **易于测试** - 组件函数可单独测试

---

## 实施计划

### 第一步：创建目录结构（5 分钟）
```bash
mkdir -p src/templates/env-setup
```

### 第二步：提取代码到独立文件（1.5 小时）
1. `components.ts` - 提取所有组件渲染函数
2. `styles.ts` - 提取所有 CSS
3. `scripts.ts` - 提取所有 JavaScript
4. `html.ts` - HTML 模板框架
5. `index.ts` - 主渲染函数

### 第三步：实现新功能（1 小时）
1. 搜索框功能
2. 别名优先显示
3. 帮助链接
4. 新建环境按钮常驻

### 第四步：测试和调试（30 分钟）
1. 编译测试
2. 功能测试
3. 修复问题

**总计：约 3 小时**

---

## 开始实施？

这个方案：
- ✅ 保持单文件 bundle
- ✅ 大幅提升代码可维护性
- ✅ 为新功能提供清晰结构
- ✅ 不需要修改构建配置

**需要我立即开始实施吗？**








