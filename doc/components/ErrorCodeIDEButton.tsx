import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React, { useEffect, useMemo, useState } from 'react';
import styles from './ErrorCodeIDEButton.module.css';
import IDESelector from './IDESelector';
import { reportEvent } from './analytics';

// IDE list for icons (from IDESelector)
const POPULAR_IDES = [
    { id: 'openclaw', iconUrl: 'https://openclaw.ai/favicon.svg' },
    { id: 'cursor', iconSlug: 'cursor' },
    { id: 'codebuddy', iconUrl: 'https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg' },
    { id: 'github-copilot', iconUrl: 'https://code.visualstudio.com/favicon.ico' },
    { id: 'claude-code', iconSlug: 'claude' },
    { id: 'windsurf', iconSlug: 'windsurf' },
    { id: 'cline', iconSlug: 'cline' },
];

// Get icon URL helper (same as IDESelector)
const iconsWithColor = new Set(['claude', 'gemini', 'baidu', 'alibaba', 'qwen', 'bytedance', 'tencent']);

function getIconUrl(ide: { iconSlug?: string; iconUrl?: string }): string | null {
    if (ide.iconUrl) return ide.iconUrl;
    if (ide.iconSlug) {
        const baseUrl = 'https://img.jsdelivr.com/raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light';
        if (iconsWithColor.has(ide.iconSlug)) {
            return `${baseUrl}/${ide.iconSlug}-color.png`;
        }
        return `${baseUrl}/${ide.iconSlug}.png`;
    }
    return null;
}

interface ErrorCodeIDEButtonProps {
    errorCode?: string;
    pageUrl?: string;
}

// i18n translations
const translations: Record<string, Record<string, string>> = {
    'zh-CN': {
        openInAI: '使用 AI 工具排查错误',
        troubleshoot: '故障排除',
        promptLabel: '提示词',
        copyPrompt: '复制提示词',
    },
    'en': {
        openInAI: 'Troubleshoot Error with AI',
        troubleshoot: 'Troubleshoot',
        promptLabel: 'Prompt',
        copyPrompt: 'Copy prompt',
    },
};

// Generate prompt based on page URL (Chinese version)
function generatePrompt(pageUrl: string, locale: string): string {
    if (locale === 'zh-CN' || locale === 'zh-Hans' || locale.startsWith('zh')) {
        return `我遇到了一个错误，正在查看文档 ${pageUrl} 以了解发生了什么。

请帮助我解决这个问题：

1. **分析代码库并使用 CloudBase MCP 工具解决问题**：
   - 深入分析我的代码库上下文，理解代码结构和相关模块
   - 阅读 CloudBase 的 AI rules 和 MCP 工具文档，理解问题的本质
   - 尝试使用 CloudBase MCP 工具（如 envQuery、login、executeReadOnlySQL 等）来诊断和解决这个问题
   - 如果需要修改代码，提出具体的修改方案，包括需要修改的文件、函数和代码行
   - **如果提供的资料不足以排查问题，请提示我复制更多的报错信息**，例如更具体的错误堆栈、完整的错误消息、相关代码片段或配置信息

2. **解释根本原因**：
   - 代码实际在做什么 vs. 它应该做什么？
   - 什么条件或场景触发了这个特定错误？
   - 是什么误解、疏忽或不当使用导致了这个问题？

3. **用费曼学习法教授概念**：
   - 用简单易懂的语言解释底层原理，就像教一个初学者一样
   - 如果涉及我不熟悉的概念（如 MCP 工具、CloudBase API、框架特性等），请先解释这些基础概念
   - 用类比和具体例子帮助我建立正确的心智模型
   - 解释这个概念在整个系统中的作用和重要性

我的目标是修复眼前的问题，同时建立持久的理解，这样我就可以在未来独立避免和解决类似的错误。`;
    }

    return `I'm encountering an error and reviewing the docs at ${pageUrl} to understand what's happening.

Please help me resolve this by:

1. **Analyze codebase and solve using CloudBase MCP tools**:
   - Deeply analyze my codebase context to understand the code structure and related modules
   - Read CloudBase AI rules and MCP tools documentation to understand the root cause
   - Try using CloudBase MCP tools (such as envQuery, login, executeReadOnlySQL, etc.) to diagnose and solve this problem
   - If code changes are needed, propose specific modifications including files, functions, and code lines to modify
   - **If the provided information is insufficient to troubleshoot, please prompt me to copy more error details**, such as more specific error stack traces, complete error messages, relevant code snippets, or configuration information

2. **Explain the root cause**:
   - What was the code actually doing vs. what it should be doing?
   - What conditions or scenarios triggered this specific error?
   - What misconception, oversight, or improper usage led to this problem?

3. **Teach concepts using the Feynman technique**:
   - Explain underlying principles in simple, accessible language, as if teaching a beginner
   - If unfamiliar concepts are involved (like MCP tools, CloudBase APIs, framework features, etc.), explain these fundamentals first
   - Use analogies and concrete examples to help me build the correct mental model
   - Explain how this concept fits into and matters within the broader system

My goal is to fix the immediate issue while building lasting understanding so I can avoid and resolve similar errors independently in the future.`;
}

export default function ErrorCodeIDEButton({
    errorCode,
    pageUrl,
}: ErrorCodeIDEButtonProps) {
    const { i18n, siteConfig } = useDocusaurusContext();
    const location = useLocation();
    const rawLocale = i18n.currentLocale || i18n.defaultLocale || 'zh-CN';
    // Normalize locale: zh-Hans -> zh-CN
    const locale = rawLocale === 'zh-Hans' ? 'zh-CN' : rawLocale;
    const t = translations[locale] || translations['zh-CN'];
    const isChinese = locale === 'zh-CN' || rawLocale.startsWith('zh');

    const [isExpanded, setIsExpanded] = useState(false);

    // Report view event on mount
    useEffect(() => {
        reportEvent({
            name: 'Error Button - View',
            eventType: 'view',
        });
    }, []);

    // Generate full page URL
    const fullPageUrl = useMemo(() => {
        if (pageUrl) return pageUrl;
        const baseUrl = siteConfig.url || '';
        const basePath = siteConfig.baseUrl || '/';
        const path = location.pathname;
        return `${baseUrl}${basePath === '/' ? '' : basePath}${path}`.replace(/\/$/, '');
    }, [pageUrl, siteConfig.url, siteConfig.baseUrl, location.pathname]);

    // Generate prompt
    const prompt = useMemo(() => generatePrompt(fullPageUrl, isChinese ? 'zh-CN' : 'en'), [fullPageUrl, isChinese]);

    return (
        <div className={styles.wrapper}>
            <div className={`${styles.container} ${!isExpanded ? styles.containerCollapsed : ''}`}>
                <div className={styles.content}>
                    <div className={styles.headerContent}>
                        <p className={styles.description}>
                            {isChinese
                                ? '遇到错误？使用 AI 工具协助排查'
                                : 'Encountering an error? Get help with AI tools'}
                        </p>
                        <button
                            type="button"
                            className={`${styles.button} ${isExpanded ? styles.buttonExpanded : ''}`}
                            onClick={() => {
                                const newExpandedState = !isExpanded;
                                setIsExpanded(newExpandedState);
                                reportEvent({
                                    name: newExpandedState ? 'Error Button - Expand' : 'Error Button - Collapse',
                                    eventType: newExpandedState ? 'expand' : 'collapse',
                                });
                            }}
                        >
                            <span className={styles.buttonText}>{t.openInAI}</span>
                            <svg
                                className={`${styles.buttonArrow} ${isExpanded ? styles.buttonArrowExpanded : ''}`}
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                            >
                                <path
                                    d="M4 6L8 10L12 6"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className={styles.expandedContent}>
                    {/* IDE Selector with custom prompt */}
                    <div className={styles.ideSelectorSection}>
                        <IDESelector customPrompt={prompt} collapsibleInstallSteps={true} collapseStep1={true} />
                    </div>
                </div>
            )}
        </div>
    );
}
