/**
 * CSS styles for env setup page
 */

export const CSS_STYLES = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  :root {
    --primary-color: #1a1a1a;
    --primary-hover: #000000;
    --accent-color: #67E9E9;
    --accent-hover: #2BCCCC;
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
    --border-color: rgba(255, 255, 255, 0.15);
    --bg-secondary: rgba(255, 255, 255, 0.08);
    --bg-glass: rgba(26, 26, 26, 0.95);
    --shadow: 0 25px 50px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2);
    --font-mono: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
    --header-bg: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0d1117 100%);
  }

  body {
    font-family: var(--font-mono);
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    position: relative;
    overflow-x: hidden;
    overflow-y: auto;
  }

  /* Custom scrollbar styles */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--accent-color);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--accent-hover);
  }

  body::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>') repeat;
    pointer-events: none;
    z-index: -1;
  }

  body::after {
    content: '';
    position: fixed;
    top: 50%; left: 50%;
    width: 500px; height: 500px;
    background: radial-gradient(circle, rgba(103, 233, 233, 0.05) 0%, transparent 70%);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: -1;
    animation: pulse 8s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.1); }
  }

  .modal {
    background: var(--bg-glass);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border-color);
    width: 100%;
    max-width: 640px;
    overflow: hidden;
    animation: modalIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    position: relative;
  }

  .modal::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.02) 50%, transparent 70%);
    animation: shimmer 3s infinite;
    pointer-events: none;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .header {
    background: var(--header-bg);
    color: var(--text-primary);
    padding: 20px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }

  .header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%);
    animation: headerShimmer 4s infinite;
    pointer-events: none;
  }

  @keyframes headerShimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 1;
  }

  .logo {
    width: 32px;
    height: 32px;
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
    animation: logoFloat 3s ease-in-out infinite;
  }

  @keyframes logoFloat {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
  }

  .title {
    font-size: 18px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 1;
  }

  .account-section {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .account-uin {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .btn-switch {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.3s ease;
    border-radius: 4px;
  }

  .btn-switch:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--accent-color);
  }

  .btn-icon-link {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 7px;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.3s ease;
    text-decoration: none;
  }

  .btn-icon-link:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--accent-color);
  }

  .content {
    padding: 32px 32px 28px;
  }

  .content-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 28px;
    text-align: center;
    letter-spacing: -0.01em;
  }

  /* Search section styles */
  .search-section {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
  }

  .search-box {
    position: relative;
    flex: 1;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
    z-index: 1;
  }

  .search-input {
    width: 100%;
    padding: 11px 38px 11px 38px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-mono);
    transition: all 0.3s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-color);
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 0 3px rgba(103, 233, 233, 0.08);
  }

  .search-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
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
    z-index: 1;
  }

  .search-clear:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.1);
  }

  .search-actions {
    display: flex;
    gap: 8px;
  }

  .btn-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 11px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .btn-action:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(103, 233, 233, 0.5);
    color: var(--accent-color);
  }

  .btn-action:active {
    transform: scale(0.95);
  }

  .btn-text {
    font-size: 13px;
    font-weight: 500;
  }

  .env-list {
    max-height: 340px;
    overflow-y: auto;
    padding-right: 6px;
    margin-bottom: 24px;
  }

  .env-list::-webkit-scrollbar {
    width: 5px;
  }

  .env-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .env-list::-webkit-scrollbar-thumb {
    background: var(--accent-color);
    border-radius: 3px;
  }

  /* Env item styles */
  .env-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
  }

  .env-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(103, 233, 233, 0.5);
    transform: translateX(2px);
  }

  .env-item.selected {
    background: rgba(103, 233, 233, 0.12);
    border-color: var(--accent-color);
    box-shadow: 0 0 0 1px rgba(103, 233, 233, 0.2);
  }

  .env-item.selected::after {
    content: '';
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    background: var(--accent-color);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--accent-color);
  }

  .env-info {
    flex: 1;
    min-width: 0;
  }

  .env-name {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .env-name.unnamed {
    opacity: 0.5;
  }

  .env-id {
    font-size: 11px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    word-break: break-all;
    opacity: 0.8;
  }

  /* Empty state */
  .empty-state {
    padding: 60px 20px;
    text-align: center;
  }

  .empty-message {
    font-size: 14px;
    color: var(--text-secondary);
    opacity: 0.7;
    line-height: 1.6;
  }

  .create-env-link {
    color: var(--accent-color);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: all 0.3s ease;
  }

  .create-env-link:hover {
    border-bottom-color: var(--accent-color);
    opacity: 0.8;
  }

  /* Action buttons */
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 28px;
  }

  .btn {
    flex: 1;
    padding: 12px 20px;
    border: none;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: var(--font-mono);
    letter-spacing: -0.01em;
  }

  .btn-primary {
    background: var(--accent-color);
    color: var(--primary-color);
    border: 1px solid var(--accent-color);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 4px 12px rgba(103, 233, 233, 0.3);
  }

  .btn-primary:disabled {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: not-allowed;
    opacity: 0.5;
    border-color: var(--border-color);
  }

  .btn-secondary {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover {
    background: var(--bg-secondary);
    border-color: rgba(255, 255, 255, 0.3);
  }

  /* Help links */
  .help-links {
    display: flex;
    gap: 20px;
    justify-content: center;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .help-link {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 6px;
    transition: all 0.3s ease;
    opacity: 0.8;
  }

  .help-link:hover {
    background: rgba(103, 233, 233, 0.08);
    color: var(--accent-color);
    opacity: 1;
  }

  /* Loading state */
  .loading {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 20px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading span {
    color: var(--text-secondary);
    font-size: 14px;
  }

  /* Success state */
  .success-state {
    text-align: center;
    padding: 40px 20px;
    animation: fadeInUp 0.8s ease-out both;
  }

  .success-icon {
    margin-bottom: 20px;
    color: var(--accent-color);
    animation: successPulse 2s ease-in-out infinite;
  }

  @keyframes successPulse {
    0%, 100% {
      transform: scale(1);
      filter: drop-shadow(0 0 8px rgba(103, 233, 233, 0.3));
    }
    50% {
      transform: scale(1.1);
      filter: drop-shadow(0 0 16px rgba(103, 233, 233, 0.6));
    }
  }

  .success-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 12px;
  }

  .success-message {
    color: var(--text-secondary);
    font-size: 16px;
    line-height: 1.5;
  }

  .selected-env-info {
    margin-top: 20px;
    padding: 16px;
    background: rgba(103, 233, 233, 0.1);
    border: 1px solid var(--accent-color);
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .env-label {
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
  }

  .env-value {
    color: var(--accent-color);
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-mono);
  }

  /* Info banner (for non-critical notifications) */
  .info-banner {
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(103, 233, 233, 0.08);
    border: 1px solid rgba(103, 233, 233, 0.2);
    border-radius: 12px;
  }

  .info-item {
    margin-bottom: 16px;
  }

  .info-item:last-child {
    margin-bottom: 0;
  }

  .info-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .info-header svg {
    color: var(--accent-color);
  }

  .info-title {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 14px;
  }

  .info-message {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 12px;
  }

  .info-details {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .detail-label {
    font-weight: 500;
  }

  .detail-value {
    font-family: var(--font-mono);
    opacity: 0.8;
  }

  .error-action {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .error-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(103, 233, 233, 0.15);
    border: 1px solid rgba(103, 233, 233, 0.3);
    border-radius: 6px;
    color: var(--accent-color);
    text-decoration: none;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .error-link:hover {
    background: rgba(103, 233, 233, 0.25);
    border-color: var(--accent-color);
  }

  .error-retry-btn {
    background: rgba(103, 233, 233, 0.2);
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .error-retry-btn:hover {
    background: rgba(103, 233, 233, 0.3);
  }
</style>
`;

