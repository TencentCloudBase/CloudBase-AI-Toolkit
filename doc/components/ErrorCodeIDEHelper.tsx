import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React, { useEffect, useState } from 'react';
import styles from './ErrorCodeIDEHelper.module.css';
import IDESelector from './IDESelector';
import { reportEvent } from './analytics';

interface ErrorCodeIDEHelperProps {
  isOpen: boolean;
  onClose: () => void;
  errorCode?: string;
  pageUrl?: string;
}

// i18n translations
const translations: Record<string, Record<string, string>> = {
  'zh-CN': {
    title: '使用 AI IDE 分析错误',
    close: '关闭',
    promptLabel: '提示词',
    copyPrompt: '复制提示词',
    promptCopied: '已复制',
    troubleshoot: '故障排除',
    troubleshootDescription: '我遇到了一个错误，正在查看文档以了解发生了什么。',
  },
  'en': {
    title: 'Analyze Error with AI IDE',
    close: 'Close',
    promptLabel: 'Prompt',
    copyPrompt: 'Copy prompt',
    promptCopied: 'Copied',
    troubleshoot: 'Troubleshoot',
    troubleshootDescription: "I'm encountering an error and reviewing the docs to understand what's happening.",
  },
};

// Generate prompt based on page URL
function generatePrompt(pageUrl: string): string {
  return `I'm encountering an error and reviewing the docs at ${pageUrl} to understand what's happening.

Please help me resolve this by:

1. **Suggest the fix**: Analyze my codebase context and propose what needs to be changed to resolve this error

2. **Explain the root cause**: Break down why this error occurred:
   - What was the code actually doing vs. what it needed to do?
   - What conditions triggered this specific error?
   - What misconception or oversight led to this?

3. **Teach the concept**: Help me understand the underlying principle:
   - Why does this error exist and what is it protecting me from?
   - What's the correct mental model for this concept?
   - How does this fit into the broader framework/language design?

4. **Show warning signs**: Help me recognize this pattern in the future:
   - What should I look out for that might cause this again?
   - Are there similar mistakes I might make in related scenarios?
   - What code smells or patterns indicate this issue?

5. **Discuss alternatives**: Explain if there are different valid approaches and their trade-offs

My goal is to fix the immediate issue while building lasting understanding so I can avoid and resolve similar errors independently in the future.`;
}

export default function ErrorCodeIDEHelper({
  isOpen,
  onClose,
  errorCode,
  pageUrl,
}: ErrorCodeIDEHelperProps) {
  const { i18n, siteConfig } = useDocusaurusContext();
  const location = useLocation();
  const locale = i18n.currentLocale || i18n.defaultLocale || 'zh-CN';
  const t = translations[locale] || translations['zh-CN'];

  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Generate full page URL
  const fullPageUrl = React.useMemo(() => {
    if (pageUrl) return pageUrl;
    const baseUrl = siteConfig.url || '';
    const basePath = siteConfig.baseUrl || '/';
    const path = location.pathname;
    return `${baseUrl}${basePath === '/' ? '' : basePath}${path}`.replace(/\/$/, '');
  }, [pageUrl, siteConfig.url, siteConfig.baseUrl, location.pathname]);

  // Generate prompt
  const prompt = React.useMemo(() => generatePrompt(fullPageUrl), [fullPageUrl]);

  // Report modal open event
  useEffect(() => {
    if (isOpen) {
      reportEvent({
        name: 'Error Helper - Modal Open',
        eventType: 'modal_open',
      });
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reportEvent({
          name: 'Error Helper - Modal Close',
          eventType: 'modal_close',
        });
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    reportEvent({
      name: 'Error Helper - Copy Prompt',
      eventType: 'copy_prompt',
    });
  };

  const handleClose = () => {
    reportEvent({
      name: 'Error Helper - Modal Close',
      eventType: 'modal_close',
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t.title}</h2>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            aria-label={t.close}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Troubleshoot section */}
          <div className={styles.troubleshootSection}>
            <h3 className={styles.troubleshootTitle}>{t.troubleshoot}</h3>
            <p className={styles.troubleshootDescription}>
              {t.troubleshootDescription}
            </p>
            <div className={styles.promptWrapper}>
              <div className={styles.promptLabel}>{t.promptLabel}</div>
              <div className={styles.promptContent}>
                <code className={styles.promptText}>{prompt}</code>
                <button
                  onClick={handleCopyPrompt}
                  className={styles.copyPromptButton}
                  title={t.copyPrompt}
                >
                  {copiedPrompt ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M13 4L6 11L3 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect
                        x="5"
                        y="5"
                        width="8"
                        height="8"
                        rx="1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M3 11V3C3 2.44772 3.44772 2 4 2H12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* IDE Selector */}
          <div className={styles.ideSelectorSection}>
            <IDESelector />
          </div>
        </div>
      </div>
    </div>
  );
}

