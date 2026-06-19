/**
 * Main renderer for env setup page
 */

import {
  renderActionButtons,
  renderEmptyState,
  renderEnvItem,
  renderErrorBanner,
  renderHeader,
  renderHelpLinks,
  renderLoadingState,
  renderNoResultsState,
  renderSearchBox,
  renderSuccessState
} from './components.js';
import { buildHTMLPage } from './html.js';
import { getJavaScripts } from './scripts.js';
import { CSS_STYLES } from './styles.js';

export interface EnvSetupOptions {
  envs?: any[];
  accountInfo?: { uin?: string; region?: string };
  errorContext?: any;
  sessionId?: string;
  wsPort: number;
  ide?: string;
}

/**
 * Render the complete env setup page
 */
export function renderEnvSetupPage(options: EnvSetupOptions): string {
  const { envs = [], accountInfo, errorContext, sessionId, wsPort, ide } = options;

  const hasEnvs = envs.length > 0;
  const hasInitError = !!errorContext?.initTcbError;
  const hasErrors = !!(errorContext?.initTcbError || errorContext?.createEnvError);

  // Build env list HTML
  let envListHTML = '';
  if (hasEnvs) {
    envListHTML = `
      ${renderSearchBox()}
      <div class="env-list" id="envList">
        ${envs.map((env, index) => renderEnvItem(env, index)).join('\n')}
      </div>
      ${renderNoResultsState()}
    `;
  } else {
    // 暂无环境时也显示搜索框、新建和刷新按钮
    envListHTML = `
      ${renderSearchBox()}
      <div class="env-list" id="envList">
        ${renderEmptyState(hasInitError)}
      </div>
      ${renderNoResultsState()}
    `;
  }

  // Build body HTML
  const bodyHTML = `
    <div class="modal">
      ${renderHeader(accountInfo, ide)}
      <div class="content">
        <h1 class="content-title">选择环境</h1>
        
        ${hasErrors ? renderErrorBanner(errorContext, sessionId) : ''}
        
        ${envListHTML}
        
        ${renderActionButtons(hasEnvs, hasInitError)}
        
        ${renderHelpLinks()}
        
        ${renderLoadingState()}
        
        ${renderSuccessState()}
      </div>
    </div>
  `;

  // Get JavaScript with WebSocket port
  const scripts = getJavaScripts(wsPort);

  // Assemble final HTML
  return buildHTMLPage(CSS_STYLES, bodyHTML, scripts);
}

