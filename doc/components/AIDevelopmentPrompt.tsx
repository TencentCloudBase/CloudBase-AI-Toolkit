import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React, { useEffect, useState } from 'react';
import styles from './AIDevelopmentPrompt.module.css';
import { reportEvent } from './analytics';
import IDESelector from './IDESelector';
import { getAllPrompts, getPromptsByCategory, getPromptsByRuleId, getRandomPrompt, getRandomPromptByCategory, getRandomPromptByRuleId } from './promptsData';

interface AIDevelopmentPromptProps {
  category?: string;  // Filter prompts by category: 'auth', 'database', 'backend', 'frontend', 'tools'
  ruleId?: string;    // Filter prompts by specific rule ID
  defaultPrompt?: string;  // Custom default prompt
  hint?: string;      // Custom hint text
}

// RuleId-based hint mappings (more specific)
const ruleIdHints: Record<string, Record<string, string>> = {
  'zh-CN': {
    'cloud-functions': '使用 AI 开发、对接和管理云函数',
    'cloudrun-development': '使用 AI 开发、对接和管理云托管服务',
    'cloudbase-document-database-web-sdk': '使用 AI 开发、对接和管理文档数据库',
    'cloudbase-document-database-in-wechat-miniprogram': '使用 AI 在小程序中开发、对接和管理文档数据库',
    'relational-database-mcp-cloudbase': '使用 AI 管理关系型数据库和 SQL 操作',
    'relational-database-web-cloudbase': '使用 AI 在 Web 应用中开发、对接和管理关系型数据库',
    'database-http-api': '使用 AI 在 App 中对接和管理数据库',
    'auth-tool-cloudbase': '使用 AI 配置和管理身份认证',
    'auth-web-cloudbase': '使用 AI 在 Web 应用中开发、对接和管理身份认证',
    'auth-wechat-miniprogram': '使用 AI 在小程序中开发、对接和管理身份认证',
    'auth-http-api': '使用 AI 在 App 中对接和管理身份认证',
    'web-development': '使用 AI 开发 Web 应用和静态托管',
    'miniprogram-development': '使用 AI 开发小程序和对接 CloudBase',
    'ui-design': '使用 AI 设计用户界面',
    'http-api-cloudbase': '使用 AI 在 App 中对接 CloudBase HTTP API',
    'spec-workflow': '使用 AI 进行需求分析和技术设计',
    'cloudbase-platform': '使用 AI 了解 CloudBase 平台和最佳实践',
    'auth-nodejs-cloudbase': '使用 AI 在 Node.js 服务端接入身份认证',
    'postgresql-development-cloudbase': '使用 AI 开发、对接和管理 PostgreSQL 数据库',
    'data-model-creation': '使用 AI 设计数据模型',
    'cloudbase-wechat-integration': '使用 AI 接入微信支付和公众号 OAuth',
    'minimal-web-baas-demo': '使用 AI 快速搭建最小前后端 Demo',
    'cloud-storage-web': '使用 AI 在 Web 应用中管理云存储文件',
    'cloudbase-declarative-deploy': '使用 AI 通过 cloudbaserc 声明式部署项目',
    'cloud-api-operations': '使用 AI 调用腾讯云管控面 API 和配置 CAM 授权',
    'cloudbase-cli': '使用 AI 通过 CLI 管理 CloudBase 资源',
    'cloudbase-code-review': '使用 AI 检查项目落地是否符合规范',
    'ops-inspector': '使用 AI 巡检环境、诊断日志和告警',
    'ai-model-web': '使用 AI 在 Web 应用中调用大模型',
    'ai-model-nodejs': '使用 AI 在 Node.js 服务端调用大模型',
    'ai-model-wechat': '使用 AI 在小程序中调用大模型',
    'cloudbase-agent': '使用 AI 构建和部署 Agent 服务',
  },
  'en': {
    'cloud-functions': 'Use AI to develop, integrate and manage cloud functions',
    'cloudrun-development': 'Use AI to develop, integrate and manage CloudRun services',
    'cloudbase-document-database-web-sdk': 'Use AI to develop, integrate and manage document databases',
    'cloudbase-document-database-in-wechat-miniprogram': 'Use AI to develop, integrate and manage document databases in mini programs',
    'relational-database-mcp-cloudbase': 'Use AI to manage relational databases and SQL operations',
    'relational-database-web-cloudbase': 'Use AI to develop, integrate and manage relational databases in web apps',
    'database-http-api': 'Use AI to integrate and manage databases in apps',
    'auth-tool-cloudbase': 'Use AI to configure and manage authentication',
    'auth-web-cloudbase': 'Use AI to develop, integrate and manage authentication in web apps',
    'auth-wechat-miniprogram': 'Use AI to develop, integrate and manage authentication in mini programs',
    'auth-http-api': 'Use AI to integrate and manage authentication in apps',
    'web-development': 'Use AI to develop web applications and static hosting',
    'miniprogram-development': 'Use AI to develop mini programs and integrate CloudBase',
    'ui-design': 'Use AI to design user interfaces',
    'http-api-cloudbase': 'Use AI to integrate CloudBase HTTP API in apps',
    'spec-workflow': 'Use AI for requirements analysis and technical design',
    'cloudbase-platform': 'Use AI to learn CloudBase platform and best practices',
    'auth-nodejs-cloudbase': 'Use AI to integrate authentication in Node.js services',
    'postgresql-development-cloudbase': 'Use AI to develop and manage PostgreSQL databases',
    'data-model-creation': 'Use AI to design data models',
    'cloudbase-wechat-integration': 'Use AI to integrate WeChat Pay and Official Account OAuth',
    'minimal-web-baas-demo': 'Use AI to scaffold a minimal full-stack demo',
    'cloud-storage-web': 'Use AI to manage cloud storage files in web apps',
    'cloudbase-declarative-deploy': 'Use AI to deploy declaratively from a cloudbaserc config',
    'cloud-api-operations': 'Use AI to call Tencent Cloud control-plane APIs and configure CAM',
    'cloudbase-cli': 'Use AI to manage CloudBase resources via the CLI',
    'cloudbase-code-review': 'Use AI to review CloudBase projects against known pitfalls',
    'ops-inspector': 'Use AI to inspect environments, diagnose logs and alarms',
    'ai-model-web': 'Use AI to call LLMs in web apps',
    'ai-model-nodejs': 'Use AI to call LLMs in Node.js services',
    'ai-model-wechat': 'Use AI to call LLMs in mini programs',
    'cloudbase-agent': 'Use AI to build and deploy agent services',
  },
};

// Category-based hint mappings (fallback)
const categoryHints: Record<string, Record<string, string>> = {
  'zh-CN': {
    auth: '使用 AI 开发、对接和管理身份认证',
    database: '使用 AI 开发、对接和管理数据库',
    backend: '使用 AI 开发、对接和管理后端服务',
    frontend: '使用 AI 开发应用和对接集成',
    ai: '使用 AI 在应用中集成大模型和 Agent',
    tools: '使用 AI 工具提升开发效率',
  },
  'en': {
    auth: 'Use AI to develop, integrate and manage authentication',
    database: 'Use AI to develop, integrate and manage databases',
    backend: 'Use AI to develop, integrate and manage backend services',
    frontend: 'Use AI to develop applications and integrate',
    ai: 'Use AI to integrate LLMs and agents into your app',
    tools: 'Use AI tools to improve development efficiency',
  },
};

// i18n translations
const translations: Record<string, Record<string, string>> = {
  'zh-CN': {
    title: 'AI 原生开发',
    description: '完成 CloudBase MCP 连接后，选择一个提示词开始',
    promptHint: '先完成 MCP 连接，再选择一个提示词开始你的 AI 原生开发之旅',
    changePrompt: '更换',
    startDevelopment: 'AI 开发',
    close: '关闭',
    modalTitle: '开始 AI 原生开发',
    modalDescription: '请先确认已完成 MCP 连接，再选择 AI 开发工具并使用提示词开始开发',
    promptLabel: '提示词',
  },
  'en': {
    title: 'AI-Native Development',
    description: 'After connecting CloudBase MCP, select a prompt to start',
    promptHint: 'Finish MCP setup first, then select a prompt to start your AI-native development journey',
    changePrompt: 'Change',
    startDevelopment: 'AI Development',
    close: 'Close',
    modalTitle: 'Start AI-Native Development',
    modalDescription: 'Make sure MCP is already connected, then select an AI development tool and use a prompt to start',
    promptLabel: 'Prompt',
  },
};

export default function AIDevelopmentPrompt({
  category,
  ruleId,
  defaultPrompt,
  hint,
}: AIDevelopmentPromptProps = {}) {
  const { i18n } = useDocusaurusContext();
  const rawLocale = i18n?.currentLocale || i18n?.defaultLocale || 'zh-CN';
  const locale = rawLocale === 'zh-Hans' ? 'zh-CN' : (rawLocale === 'en' ? 'en' : 'zh-CN');
  const t = translations[locale] || translations['zh-CN'] || translations['en'] || {};
  
  // Get hint text: custom hint > ruleId-based hint > category-based hint > default hint
  const getHintText = (): string => {
    if (hint) return hint;
    if (ruleId && ruleIdHints[locale] && ruleIdHints[locale][ruleId]) {
      return ruleIdHints[locale][ruleId];
    }
    if (category && categoryHints[locale] && categoryHints[locale][category]) {
      return categoryHints[locale][category];
    }
    return t.promptHint;
  };

  // Get initial prompt based on props
  const getInitialPrompt = (): string => {
    if (defaultPrompt) return defaultPrompt;
    if (ruleId) return getRandomPromptByRuleId(ruleId);
    if (category) return getRandomPromptByCategory(category);
    return getRandomPrompt();
  };

  const [currentPrompt, setCurrentPrompt] = useState<string>(() => getInitialPrompt());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Report view event on mount
  useEffect(() => {
    reportEvent({
      name: 'AI Development Prompt - View',
      eventType: 'view',
    });
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        reportEvent({
          name: 'AI Development Prompt - Close Modal',
          eventType: 'close_modal',
        });
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  const handleChangePrompt = () => {
    // Get available prompts based on props
    let availablePrompts: string[] = [];
    if (ruleId) {
      availablePrompts = getPromptsByRuleId(ruleId);
    } else if (category) {
      availablePrompts = getPromptsByCategory(category);
    } else {
      availablePrompts = getAllPrompts();
    }

    // Fallback to all prompts if filtered list is empty
    if (availablePrompts.length === 0) {
      availablePrompts = getAllPrompts();
    }

    let newPrompt: string;
    if (ruleId) {
      newPrompt = getRandomPromptByRuleId(ruleId);
    } else if (category) {
      newPrompt = getRandomPromptByCategory(category);
    } else {
      newPrompt = getRandomPrompt();
    }

    // Ensure we get a different prompt if there are multiple prompts
    let attempts = 0;
    while (newPrompt === currentPrompt && availablePrompts.length > 1 && attempts < 10) {
      if (ruleId) {
        newPrompt = getRandomPromptByRuleId(ruleId);
      } else if (category) {
        newPrompt = getRandomPromptByCategory(category);
      } else {
        newPrompt = getRandomPrompt();
      }
      attempts++;
    }
    setCurrentPrompt(newPrompt);
    const eventType = category || ruleId 
      ? `change_prompt_${category || ruleId}` 
      : 'change_prompt';
    reportEvent({
      name: 'AI Development Prompt - Change Prompt',
      eventType,
    });
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    reportEvent({
      name: 'AI Development Prompt - Open Modal',
      eventType: 'open_modal',
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    reportEvent({
      name: 'AI Development Prompt - Close Modal',
      eventType: 'close_modal',
    });
  };

  return (
    <>
      <div className={styles.container}>
        <p className={styles.hint}>{getHintText()}</p>
        <div className={styles.inputWrapper}>
          <div className={styles.inputContainer}>
            <input
              type="text"
              className={styles.input}
              value={currentPrompt}
              readOnly
            />
            <div className={styles.inputActions}>
              <button
                className={styles.changeButton}
                onClick={handleChangePrompt}
                title={t.changePrompt}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2.5 3.5V6.5H5.5M13.5 12.5V9.5H10.5M2.5 6.5C3.5 4.5 5.5 3 8 3C10.5 3 12.5 4.5 13.5 6.5M13.5 9.5C12.5 11.5 10.5 13 8 13C5.5 13 3.5 11.5 2.5 9.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                className={styles.startButton}
                onClick={handleOpenModal}
                title={t.startDevelopment}
              >
                {t.startDevelopment}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t.modalTitle}</h2>
              <button
                className={styles.closeButton}
                onClick={handleCloseModal}
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
              {/* IDE Selector with custom prompt */}
              <IDESelector 
                customPrompt={currentPrompt}
                collapsibleInstallSteps={true}
                collapseStep1={true}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

