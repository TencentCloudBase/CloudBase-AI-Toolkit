/**
 * Reusable UI components for env setup page
 */

export function renderHeader(accountInfo?: { uin?: string; region?: string }, ide?: string) {
  const hasAccount = !!accountInfo?.uin;
  const isCodeBuddy = ide === "CodeBuddy";

  return `
    <div class="header">
      <div class="header-left">
        <img class="logo" src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/cloudbase-logo.svg" alt="CloudBase Logo" />
        <span class="title">CloudBase</span>
      </div>
      ${(hasAccount && accountInfo.region !== 'ap-singapore') ? /** 国际站不支持切 */ `
        <div class="header-right">
          <div class="account-section">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span class="account-uin">${accountInfo.uin}</span>
            ${accountInfo.region ? `<span class="account-region">${accountInfo.region}</span>` : ''}
            ${!isCodeBuddy ? `
              <button class="btn-switch" onclick="switchAccount()" title="切换账号">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M17 2l4 4-4 4M7 22l-4-4 4-4M21 6H10M3 18h11"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `.trim();
}

export function renderSearchBox() {
  return `
    <div class="search-section">
      <div class="search-box">
        <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="search-actions">
        <button class="btn-action" onclick="createNewEnv()" title="新建环境">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span class="btn-text">新建环境</span>
        </button>
        <button class="btn-action" onclick="refreshEnvList()" title="刷新环境列表">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
      </div>
    </div>
  `.trim();
}

export function renderEnvItem(env: any, index: number) {
  const alias = env.Alias || '(未命名)';
  const envId = env.EnvId;
  const hasAlias = !!env.Alias;

  return `
    <div class="env-item" onclick="selectEnv('${envId}', this)">
      <div class="env-info">
        <div class="env-name ${!hasAlias ? 'unnamed' : ''}">${alias}</div>
        <div class="env-id">${envId}</div>
      </div>
    </div>
  `.trim();
}

export function renderEmptyState(hasInitError: boolean) {
  return `
    <div class="empty-state">
      <p class="empty-message">
        暂无环境，请先<a href="https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp" onclick="openUrl(event, 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'); return false;" class="create-env-link">创建环境</a>，然后点击刷新按钮重试
      </p>
    </div>
  `.trim();
}

export function renderNoResultsState() {
  return `
    <div class="empty-state" id="noResults" style="display: none;">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.3;">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <p class="empty-message">未找到匹配的环境</p>
    </div>
  `.trim();
}

export function renderHelpLinks() {
  return `
    <div class="help-links">
      <a href="https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/" onclick="openUrl(event, 'https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/'); return false;" class="help-link">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        帮助文档
      </a>
      <a href="https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials" onclick="openUrl(event, 'https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials'); return false;" class="help-link">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        视频教程
      </a>
      <a href="https://github.com/TencentCloudBase/CloudBase-AI-ToolKit" onclick="openUrl(event, 'https://github.com/TencentCloudBase/CloudBase-AI-ToolKit'); return false;" class="help-link">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        GitHub
      </a>
    </div>
  `.trim();
}

export function renderActionButtons(hasEnvs: boolean, hasInitError: boolean) {
  return `
    <div class="actions">
      <button class="btn btn-secondary" onclick="cancel()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        取消
      </button>
      <button class="btn btn-primary" id="confirmBtn" onclick="confirm()" disabled>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        确认选择
      </button>
    </div>
  `.trim();
}

export function renderLoadingState() {
  return `
    <div class="loading" id="loading" style="display: none;">
      <div class="spinner"></div>
      <span>正在配置环境...</span>
    </div>
  `.trim();
}

export function renderSuccessState() {
  return `
    <div class="success-state" id="successState" style="display: none;">
      <div class="success-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <h2 class="success-title">环境配置成功！</h2>
      <p class="success-message">已成功选择 CloudBase 环境</p>
      <div class="selected-env-info">
        <span class="env-label">环境 ID:</span>
        <span class="env-value" id="selectedEnvDisplay"></span>
      </div>
    </div>
  `.trim();
}

export function renderErrorBanner(errorContext: any, sessionId?: string) {
  const initTcbError = errorContext?.initTcbError;
  const createEnvError = errorContext?.createEnvError;

  // Only show initTcbError, hide createEnvError
  if (!initTcbError) {
    return '';
  }

  return `
    <div class="info-banner" id="errorBanner">
      ${initTcbError ? `
        <div class="info-item">
          <div class="info-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span class="info-title">${escapeHtml(initTcbError.message)}</span>
          </div>
          <div class="info-message">${escapeHtml(initTcbError.actionText || '')}</div>
          ${initTcbError.requestId ? `
            <div class="info-details">
              <span class="detail-label">错误码:</span> <span class="detail-value">${escapeHtml(initTcbError.code)}</span>
              <span class="detail-label">请求 ID:</span> <span class="detail-value">${escapeHtml(initTcbError.requestId)}</span>
            </div>
          ` : ''}
          ${initTcbError.needRealNameAuth ? `
            <div class="error-action">
              <a href="${initTcbError.helpUrl || 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'}" onclick="openUrl(event, '${initTcbError.helpUrl || 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'}'); return false;" class="error-link">
                前往实名认证
              </a>
            </div>
          ` : ''}
          ${initTcbError.needCamAuth ? `
            <div class="error-action">
              <a href="${initTcbError.helpUrl || 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'}" onclick="openUrl(event, '${initTcbError.helpUrl || 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp'}'); return false;" class="error-link">
                前往开通 CloudBase 服务
              </a>
              ${sessionId ? `
                <button class="error-link error-retry-btn" onclick="retryInitTcb('${sessionId}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  重试
                </button>
              ` : ''}
            </div>
          ` : ''}
          ${!initTcbError.needRealNameAuth && !initTcbError.needCamAuth && initTcbError.helpUrl ? `
            <div class="error-action">
              <a href="${initTcbError.helpUrl}" onclick="openUrl(event, '${initTcbError.helpUrl}'); return false;" class="error-link">
                前往开通 CloudBase 服务
              </a>
              ${sessionId ? `
                <button class="error-link error-retry-btn" onclick="retryInitTcb('${sessionId}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  重试
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `.trim();
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

