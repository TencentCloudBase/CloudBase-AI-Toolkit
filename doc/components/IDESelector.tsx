import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './IDESelector.module.css';
import { reportEvent } from './analytics';
import { getRandomPrompt } from './promptsData';

interface IDE {
  id: string;
  name: string;
  platform: string;
  configPath: string;
  configExample: string;
  iconSlug?: string;
  iconUrl?: string;
  docUrl?: string;
  oneClickInstallUrl?: string;
  oneClickInstallImage?: string;
  supportsProjectMCP?: boolean;
  cliCommand?: string;
  cliConfigExample?: string;
  alternativeConfig?: string;
  installCommand?: string;
  installCommandDocs?: string;
  useCommandInsteadOfConfig?: boolean;
}

const IDES: IDE[] = [
  {
    id: 'wechat-devtools',
    name: '微信开发者工具',
    platform: '微信开发者工具',
    configPath: 'CodeBuddy MCP 市场',
    iconUrl: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/assets/wechat-devtools-logo.png?v=2',
    docUrl: 'https://www.codebuddy.ai/docs/zh/ide/Config%20MCP',
    supportsProjectMCP: false,
    useCommandInsteadOfConfig: true,
    installCommandDocs: '**步骤 1：安装 CodeBuddy 扩展**\n\n1. 在微信开发者工具中，点击顶部菜单栏的「扩展」\n2. 在扩展市场中搜索「CodeBuddy」\n3. 安装「腾讯云代码助手 CodeBuddy」扩展\n\n**步骤 2：安装 CloudBase MCP**\n\n1. 安装完成后，在工具栏找到 CodeBuddy 图标\n2. 点击右上角的 CodeBuddy 设置图标\n3. 在 MCP 市场中搜索并安装「CloudBase MCP」\n\n安装完成后即可在 CodeBuddy 中使用 CloudBase AI 功能。',
    configExample: '',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    platform: '命令行工具',
    configPath: 'CloudBase Skills',
    iconUrl: 'https://openclaw.ai/favicon.svg',
    docUrl: 'https://docs.openclaw.ai/getting-started',
    useCommandInsteadOfConfig: true,
    configExample: '',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    platform: '独立 IDE',
    configPath: 'CloudBase Skills',
    iconUrl: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/assets/workbuddy-logo.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/workbuddy',
    configExample: '',
    showInstallButton: false,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    platform: '独立 IDE',
    configPath: '.cursor/mcp.json',
    iconSlug: 'cursor',
    docUrl: 'https://docs.cursor.com/context/model-context-protocol#configuration-locations',
    supportsProjectMCP: true,
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Cursor"
      }
    }
  }
}`,
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    platform: 'VS Code、JetBrains、微信开发者工具',
    configPath: '.codebuddy/mcp.json',
    iconUrl: 'https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg',
    docUrl: 'https://www.codebuddy.ai/docs/zh/ide/Config%20MCP',
    supportsProjectMCP: true,
    alternativeConfig: '在 MCP 配置中增加如下配置',
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
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    platform: '命令行工具',
    configPath: '.mcp.json',
    iconSlug: 'claude',
    docUrl: 'https://docs.anthropic.com/en/docs/claude-code/mcp#project-scope',
    supportsProjectMCP: true,
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "ClaudeCode"
      }
    }
  }
}`,
  },
  {
    id: 'codebuddy-code',
    name: 'CodeBuddy Code',
    platform: '命令行工具',
    configPath: '.mcp.json',
    iconUrl: 'https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg',
    docUrl: 'https://cnb.cool/codebuddy/codebuddy-code/-/blob/main/docs/mcp.md',
    supportsProjectMCP: true,
    cliCommand: 'codebuddy mcp add --scope project cloudbase --env INTEGRATION_IDE=CodeBuddyCode -- npx @cloudbase/cloudbase-mcp@latest',
    alternativeConfig: '或者将以下配置添加到 .mcp.json:',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "type": "stdio",
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "CodeBuddyCode"
      }
    }
  }
}`,
  },
  {
    id: 'github-copilot',
    name: 'VSCode',
    platform: 'VS Code 插件',
    configPath: '.vscode/mcp.json',
    iconUrl: 'https://code.visualstudio.com/favicon.ico',
    docUrl: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
    supportsProjectMCP: true,
    configExample: `{
  "servers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "VSCode"
      }
    }
  }
}`,
  },
  {
    id: 'trae',
    name: 'Trae',
    platform: '独立 IDE',
    configPath: '.trae/mcp.json',
    iconUrl: 'https://lf-cdn.trae.ai/obj/trae-ai-sg/trae_website_prod/favicon.png',
    docUrl: 'https://docs.trae.ai/ide/use-mcp-servers-in-agents?_lang=zh',
    supportsProjectMCP: true,
    oneClickInstallUrl: 'trae://trae.ai-ide/mcp-import?type=stdio&name=cloudbase&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAY2xvdWRiYXNlL2Nsb3VkYmFzZS1tY3BAbGF0ZXN0Il0sImVudiI6eyJJTlRFR1JBVElPTl9JREUiOiJUcmFlIn19',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Trae"
      }
    }
  }
}`,
  },
  {
    id: 'tongyi-lingma',
    name: '通义灵码',
    platform: 'VS Code、JetBrains 插件',
    configPath: '.tongyi-lingma/mcp.json',
    iconUrl: 'https://img.alicdn.com/imgextra/i1/O1CN01BN6Jtc1lCfJNviV7H_!!6000000004783-2-tps-134-133.png',
    docUrl: 'https://help.aliyun.com/zh/lingma/user-guide/guide-for-using-mcp',
    alternativeConfig: '注意：通义灵码应该没有配置文件，请在通义灵码的 MCP 配置中添加以下配置：',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "LingMa"
      }
    }
  }
}`,
  },
  {
    id: 'baidu-comate',
    name: '文心快码',
    platform: 'VS Code、JetBrains 插件',
    configPath: '.baidu-comate/mcp.json',
    iconUrl: 'https://comate.baidu.com/images/favicon.ico',
    docUrl: 'https://cloud.baidu.com/doc/COMATE/s/km9l4bzwt',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Comate"
      }
    }
  }
}`,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    platform: '命令行工具',
    configPath: '.gemini/settings.json',
    iconSlug: 'gemini',
    docUrl: 'https://ai.google.dev/gemini-api/docs',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Gemini"
      }
    }
  }
}`,
  },
  {
    id: 'openai-codex-cli',
    name: 'OpenAI Codex CLI',
    platform: '命令行工具',
    configPath: '.openai-codex/mcp.json',
    iconSlug: 'openai',
    docUrl: 'https://help.openai.com/en/articles/11096431-openai-codex-ci-getting-started',
    useCommandInsteadOfConfig: true,
    installCommand: 'codex mcp add cloudbase --env INTEGRATION_IDE=CodeX -- cloudbase-mcp',
    installCommandDocs: '**前置步骤：** 请先全局安装 CloudBase MCP 工具：\n```bash\nnpm i @cloudbase/cloudbase-mcp -g\n```\n\n根据运行系统在终端中运行指令：\n\n**MacOS, Linux, WSL:**\n```bash\ncodex mcp add cloudbase --env INTEGRATION_IDE=CodeX -- cloudbase-mcp\n```\n\n**Windows Powershell:**\n```bash\ncodex mcp add cloudbase --env INTEGRATION_IDE=CodeX -- cmd /c cloudbase-mcp\n```',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "OpenAI Codex CLI"
      }
    }
  }
}`,
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    platform: '命令行工具',
    configPath: '.qwen/settings.json',
    iconSlug: 'qwen',
    docUrl: 'https://qwenlm.github.io/qwen-code-docs/zh/cli/index',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Qwen"
      }
    }
  }
}`,
  },
  {
    id: 'roocode',
    name: 'RooCode',
    platform: 'VS Code 插件',
    configPath: '.roocode/mcp.json',
    iconUrl: 'https://docs.roocode.com/img/favicon.ico',
    docUrl: 'https://docs.roocode.com/features/mcp/using-mcp-in-roo',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "disabled": false,
      "env": {
        "INTEGRATION_IDE": "RooCode"
      }
    }
  }
}`,
  },
  {
    id: 'augment-code',
    name: 'Augment Code',
    platform: 'VS Code、JetBrains 插件',
    configPath: '.vscode/settings.json',
    iconUrl: 'https://www.augmentcode.com/favicon.svg',
    docUrl: 'https://docs.augmentcode.com/setup-augment/mcp',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Augment"
      }
    }
  }
}`,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    platform: '命令行工具',
    configPath: '.opencode.json',
    iconUrl: 'https://avatars.githubusercontent.com/u/66570915?s=200&v=4',
    docUrl: 'https://opencode.ai/docs/config',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "OpenCode"
      }
    }
  }
}`,
  },
  {
    id: 'kiro',
    name: 'Kiro',
    platform: '独立 IDE',
    configPath: '.kiro/settings/mcp.json',
    iconUrl: 'https://kiro.dev/favicon.ico',
    docUrl: 'https://kiro.dev/docs/mcp/configuration/',
    supportsProjectMCP: true,
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Kiro"
      }
    }
  }
}`,
  },
  {
    id: 'qoder',
    name: 'Qoder',
    platform: '独立 IDE',
    configPath: 'Qoder 设置 > MCP',
    iconUrl: 'https://g.alicdn.com/qbase/qoder/0.0.183/favIcon.svg',
    docUrl: 'https://docs.qoder.com/zh/user-guide/chat/model-context-protocol',
    supportsProjectMCP: false,
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Qoder"
      }
    }
  }
}`,
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    platform: '独立 IDE',
    configPath: '.agent/rules/',
    iconUrl: 'https://antigravity.google/assets/image/antigravity-logo.png',
    docUrl: 'https://antigravity.google/docs',
    supportsProjectMCP: true,
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Antigravity"
      }
    }
  }
}`,
  },
  {
    id: 'windsurf',
    name: 'WindSurf',
    platform: '独立 IDE',
    configPath: '.windsurf/mcp.json',
    iconSlug: 'windsurf',
    docUrl: 'https://docs.windsurf.com/windsurf/cascade/memories',
    supportsProjectMCP: true,
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "WindSurf"
      }
    }
  }
}`,
  },
  {
    id: 'cline',
    name: 'Cline',
    platform: 'VS Code 插件',
    configPath: '.cline/mcp.json',
    iconSlug: 'cline',
    docUrl: 'https://docs.cline.bot/mcp/configuring-mcp-servers',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "autoApprove": [],
      "timeout": 60,
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Cline"
      },
      "transportType": "stdio",
      "disabled": false
    }
  }
}`,
  },
  {
    id: 'cloudbase-cli',
    name: 'CloudBase CLI',
    platform: '命令行工具',
    configPath: '项目级配置',
    iconUrl: 'https://docs.cloudbase.net/img/favicon.png',
    docUrl: 'https://docs.cloudbase.net/cli-v1/ai/introduce',
    supportsProjectMCP: true,
    useCommandInsteadOfConfig: true,
    installCommand: 'npm i -g @cloudbase/cli',
    installCommandDocs: '**安装 CloudBase CLI：**\n\n```bash\nnpm i -g @cloudbase/cli\n```\n\n**初始化配置：**\n\n```bash\ntcb ai\n```\n\n配置向导会引导你完成 AI 工具的配置。CloudBase CLI 内置了 MCP 和 AI 开发规则，无需手动配置。\n\n**开始使用：**\n\n```bash\ntcb ai\n```',
    configExample: '',
  },
  {
    id: 'iflow-cli',
    name: 'iFlow CLI',
    platform: '命令行工具',
    configPath: '.iflow/settings.json',
    iconUrl: 'https://img.alicdn.com/imgextra/i1/O1CN01nulwex1q7Eq1TVqUh_!!6000000005448-55-tps-32-32.svg',
    docUrl: 'https://platform.iflow.cn/cli/examples/mcp',
    supportsProjectMCP: false,
    cliCommand: 'iflow mcp add-json --scope project cloudbase \'{"command":"npx","args":["@cloudbase/cloudbase-mcp@latest"],"env":{"INTEGRATION_IDE":"iFlow"}}\'',
    alternativeConfig: '或者将以下配置添加到 .iflow/settings.json:',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "iFlow"
      }
    }
  }
}`,
  },
];

// JSON syntax highlighter
function highlightJSON(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    // Match patterns in order
    while (remaining.length > 0) {
      // String key (before colon)
      const keyMatch = remaining.match(/^(\s*)("[\w-]+")(:\s*)/);
      if (keyMatch) {
        if (keyMatch[1]) parts.push(keyMatch[1]);
        parts.push(<span key={`key-${lineIndex}-${keyIndex++}`} className={styles.jsonKey}>{keyMatch[2]}</span>);
        parts.push(keyMatch[3]);
        remaining = remaining.slice(keyMatch[0].length);
        continue;
      }

      // String value
      const stringMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
      if (stringMatch) {
        parts.push(<span key={`str-${lineIndex}-${keyIndex++}`} className={styles.jsonString}>{stringMatch[1]}</span>);
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }

      // Brackets, braces, etc.
      const bracketMatch = remaining.match(/^([\[\]{}:,])/);
      if (bracketMatch) {
        parts.push(<span key={`br-${lineIndex}-${keyIndex++}`} className={styles.jsonBracket}>{bracketMatch[1]}</span>);
        remaining = remaining.slice(1);
        continue;
      }

      // Whitespace or other
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }

    return (
      <div key={lineIndex} className={styles.codeLine}>
        <span className={styles.lineNumber}>{lineIndex + 1}</span>
        <span className={styles.lineContent}>{parts}</span>
      </div>
    );
  });
}

interface IDESelectorProps {
  defaultIDE?: string;
  showInstallButton?: boolean;
  customPrompt?: string;
  collapsibleInstallSteps?: boolean;
  collapseStep1?: boolean;
}

// i18n translations
const translations: Record<string, Record<string, string>> = {
  'zh-CN': {
    client: 'Client',
    configureDescription: '配置你的 AI 工具以连接 CloudBase 能力',
    connectionModesHint: '支持本地与托管两种连接方式，详见 ',
    connectionModesLink: '连接方式',
    connectionModesSuffix: '。',
    installation: '步骤 1：安装 / 配置 CloudBase',
    useTemplate: '使用项目模板（推荐）',
    templateDescription: '模板已内置 MCP 配置和 AI 规则',
    viewTemplates: '查看模板',
    oneClickInstall: '一键安装',
    orManualConfig: '或手动配置',
    orAddConfig: '将以下配置添加到项目目录下的',
    step2Verify: '步骤 2：和 AI 对话',
    showMore: '显示配置选项',
    showLess: '收起',
    verifyDescription: '在 AI 对话中依次输入以下内容:',
    installSkillsPrompt: '安装 CloudBase Skills：命令 npx skills add tencentcloudbase/cloudbase-skills -y',
    useSkillsPrefix: '使用 CloudBase Skills：',
    cliCommand: 'CLI 命令',
    alternativeConfig: '替代配置',
    needHelp: '需要帮助？',
    viewDocs: '查看',
    docs: '文档',
    searchPlaceholder: '搜索...',
    noResults: '未找到匹配的 IDE',
    copyCode: '复制代码',
    copyPrompt: '复制提示词',
    refreshPrompt: '刷新',
    openInIDE: '用 {name} 打开',
  },
  'en': {
    client: 'Client',
    configureDescription: 'Configure your AI tool to connect with CloudBase capabilities',
    connectionModesHint: 'Supports local and hosted connection. See ',
    connectionModesLink: 'connection modes',
    connectionModesSuffix: '.',
    installation: 'Step 1: Install / Configure CloudBase',
    useTemplate: 'Use project template (recommended)',
    templateDescription: 'Template includes MCP configuration and AI rules',
    viewTemplates: 'View templates',
    oneClickInstall: 'Install in one click',
    orManualConfig: 'Or manual configuration',
    orAddConfig: 'Or add this configuration to',
    step2Verify: 'Step 2: Chat with AI',
    showMore: 'Show configuration options',
    showLess: 'Show less',
    verifyDescription: 'Enter the following in your AI chat in order:',
    installSkillsPrompt: 'Install CloudBase Skills: run npx skills add tencentcloudbase/cloudbase-skills -y',
    useSkillsPrefix: 'Use CloudBase Skills:',
    cliCommand: 'CLI command',
    alternativeConfig: 'Alternative configuration',
    needHelp: 'Need help?',
    viewDocs: 'View',
    docs: 'docs',
    searchPlaceholder: 'Search...',
    noResults: 'No matching IDE found',
    copyCode: 'Copy code',
    copyPrompt: 'Copy prompt',
    refreshPrompt: 'Refresh',
    openInIDE: 'Open with {name}',
  },
};

export default function IDESelector({
  defaultIDE,
  showInstallButton = true,
  customPrompt,
  collapsibleInstallSteps = false,
  collapseStep1 = false
}: IDESelectorProps) {
  const { i18n } = useDocusaurusContext();
  // Normalize locale: zh-Hans -> zh-CN, en -> en
  const rawLocale = i18n?.currentLocale || i18n?.defaultLocale || 'zh-CN';
  const locale = rawLocale === 'zh-Hans' ? 'zh-CN' : (rawLocale === 'en' ? 'en' : 'zh-CN');
  const isEnglish = locale === 'en';

  // Get translations with fallback chain
  const t = translations[locale] || translations['zh-CN'] || translations['en'] || {};

  // Safe helper function to replace {name} placeholder
  const getOpenInIDEText = (ideName?: string): string => {
    const name = ideName || 'IDE';
    // Try to get template from translations
    let template = t?.openInIDE;

    // Fallback to default based on locale
    if (!template || typeof template !== 'string') {
      template = isEnglish ? 'Open with {name}' : '用 {name} 打开';
    }

    // Final safety check
    if (typeof template !== 'string') {
      return isEnglish ? `Open with ${name}` : `用 ${name} 打开`;
    }

    // Perform replacement
    try {
      return template.replace('{name}', name);
    } catch (error) {
      // Ultimate fallback if replace fails
      return isEnglish ? `Open with ${name}` : `用 ${name} 打开`;
    }
  };

  const [selectedIDE, setSelectedIDE] = useState<string>(defaultIDE || 'cursor');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [showAllInstallSteps, setShowAllInstallSteps] = useState(!collapsibleInstallSteps);
  const [isStep1Expanded, setIsStep1Expanded] = useState(!collapseStep1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const ide = IDES.find(i => i.id === selectedIDE) || IDES[0];

  const filteredIDES = useMemo(() => {
    if (!searchQuery) return IDES;
    const query = searchQuery.toLowerCase();
    return IDES.filter(ide =>
      ide.name.toLowerCase().includes(query) ||
      ide.platform.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Report view event on mount
  useEffect(() => {
    reportEvent({
      name: 'IDE Selector - View',
      ideId: ide.id,
      eventType: 'view',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Icons that have -color version
  const iconsWithColor = new Set(['claude', 'gemini', 'baidu', 'alibaba', 'qwen', 'bytedance', 'tencent']);

  const getIconUrl = (ide: IDE) => {
    if (ide.iconUrl) return ide.iconUrl;
    if (ide.iconSlug) {
      const baseUrl = 'https://img.jsdelivr.com/raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light';
      if (iconsWithColor.has(ide.iconSlug)) {
        return `${baseUrl}/${ide.iconSlug}-color.png`;
      }
      return `${baseUrl}/${ide.iconSlug}.png`;
    }
    return null;
  };

  // Generate Cursor one-click install URL
  const generateCursorInstallUrl = (ideConfig: IDE): string => {
    const config = {
      env: {
        INTEGRATION_IDE: ideConfig.name
      },
      command: 'npx',
      args: ['@cloudbase/cloudbase-mcp@latest']
    };
    const base64Config = btoa(JSON.stringify(config));
    return `https://cursor.com/en-US/install-mcp?name=cloudbase&config=${encodeURIComponent(base64Config)}`;
  };

  // Generate VSCode one-click install URL
  const generateVSCodeInstallUrl = (ideConfig: IDE): string => {
    const config = {
      name: 'cloudbase',
      command: 'npx',
      args: ['@cloudbase/cloudbase-mcp@latest'],
      env: {
        INTEGRATION_IDE: ideConfig.name
      }
    };
    const configJson = JSON.stringify(config);
    return `vscode:mcp/install?${encodeURIComponent(configJson)}`;
  };

  const getOneClickInstallUrl = (): string | null => {
    if (ide.id === 'cursor') {
      return generateCursorInstallUrl(ide);
    }
    if (ide.id === 'github-copilot') {
      return generateVSCodeInstallUrl(ide);
    }
    return ide.oneClickInstallUrl || null;
  };

  const oneClickInstallUrl = getOneClickInstallUrl();
  const isProtocolInstallUrl = !!oneClickInstallUrl && !/^https?:\/\//i.test(oneClickInstallUrl);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(ide.configExample);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    reportEvent({
      name: 'IDE Selector - Copy Config',
      ideId: ide.id,
      eventType: 'copy_config',
    });
  };

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [randomPrompt, setRandomPrompt] = useState<string>(() => getRandomPrompt());
  const [copiedSecondPrompt, setCopiedSecondPrompt] = useState(false);
  const secondPrompt = customPrompt || randomPrompt;
  const installPrompt = t.installSkillsPrompt || '安装 CloudBase Skills：命令 npx skills add tencentcloudbase/cloudbase-skills -y';
  const secondPromptWithSkills = `${t.useSkillsPrefix || '使用 CloudBase Skills：'} ${secondPrompt}`.trim();

  const handleRefreshPrompt = () => {
    // Only refresh if there's no customPrompt (customPrompt is fixed)
    if (!customPrompt) {
      setRandomPrompt(getRandomPrompt());
      reportEvent({
        name: 'IDE Selector - Refresh Prompt',
        ideId: ide.id,
        eventType: 'refresh_prompt',
      });
    }
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(installPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    reportEvent({
      name: 'IDE Selector - Copy Prompt',
      ideId: ide.id,
      eventType: 'copy_prompt',
    });
  };

  const handleCopySecondPrompt = async () => {
    await navigator.clipboard.writeText(secondPromptWithSkills);
    setCopiedSecondPrompt(true);
    setTimeout(() => setCopiedSecondPrompt(false), 2000);
    reportEvent({
      name: 'IDE Selector - Copy Second Prompt',
      ideId: ide.id,
      eventType: 'copy_prompt',
    });
  };

  // Generate IDE deep link URL (only Cursor is supported currently)
  const getIDEDeepLink = (promptToUse?: string): string | null => {
    // Only Cursor supports deep link currently
    if (ide.id !== 'cursor') {
      return null;
    }

    const prompt = promptToUse || installPrompt;
    const encodedPrompt = encodeURIComponent(prompt);
    return `https://cursor.com/link/prompt?text=${encodedPrompt}`;
  };

  const handleOpenIDE = (promptToUse?: string) => {
    const deepLink = getIDEDeepLink(promptToUse);
    if (deepLink) {
      // Try protocol handler first (for desktop apps)
      if (deepLink.startsWith('http')) {
        // For HTTPS links, open in new tab as fallback
        window.open(deepLink, '_blank');
      } else {
        // For protocol handlers, try to open directly
        window.location.href = deepLink;
      }
      reportEvent({
        name: 'IDE Selector - Open IDE',
        ideId: ide.id,
        eventType: 'open_ide',
      });
    }
  };

  const handleCopyCli = async () => {
    if (ide.cliCommand) {
      await navigator.clipboard.writeText(ide.cliCommand);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    }
  };

  const handleSelectIDE = (ideId: string) => {
    setSelectedIDE(ideId);
    setIsOpen(false);
    setSearchQuery('');
    reportEvent({
      name: 'IDE Selector - Switch',
      ideId: ideId,
      eventType: 'switch',
    });
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    const currentIndex = filteredIDES.findIndex(i => i.id === selectedIDE);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < filteredIDES.length - 1) {
          const newIdeId = filteredIDES[currentIndex + 1].id;
          setSelectedIDE(newIdeId);
          reportEvent({
            name: 'IDE Selector - Switch',
            ideId: newIdeId,
            eventType: 'switch',
          });
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          const newIdeId = filteredIDES[currentIndex - 1].id;
          setSelectedIDE(newIdeId);
          reportEvent({
            name: 'IDE Selector - Switch',
            ideId: newIdeId,
            eventType: 'switch',
          });
        }
        break;
      case 'Enter':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header with Client label and IDE selector */}
      <div className={styles.header}>
        <span className={styles.clientLabel}>{t.client}</span>
        <div className={styles.dropdownWrapper} ref={dropdownRef}>
          <button
            className={`${styles.dropdownTrigger} ${isOpen ? styles.dropdownTriggerOpen : ''}`}
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
          >
            {getIconUrl(ide) && (
              <img
                src={getIconUrl(ide)!}
                alt=""
                className={styles.triggerIcon}
              />
            )}
            <span className={styles.triggerText}>{ide.name}</span>
            <svg
              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {isOpen && (
            <div className={styles.dropdown} role="listbox">
              <div className={styles.searchWrapper}>
                <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M6.5 11C9.26142 11 11.5 8.76142 11.5 6C11.5 3.23858 9.26142 1 6.5 1C3.73858 1 1.5 3.23858 1.5 6C1.5 8.76142 3.73858 11 6.5 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 12L10 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <div className={styles.dropdownList}>
                {filteredIDES.map((item) => (
                  <button
                    key={item.id}
                    className={`${styles.dropdownItem} ${item.id === selectedIDE ? styles.dropdownItemSelected : ''}`}
                    onClick={() => handleSelectIDE(item.id)}
                    role="option"
                    aria-selected={item.id === selectedIDE}
                  >
                    {getIconUrl(item) && (
                      <img
                        src={getIconUrl(item)!}
                        alt=""
                        className={styles.itemIcon}
                      />
                    )}
                    <span className={styles.itemName}>{item.name}</span>
                    {item.id === selectedIDE && (
                      <svg className={styles.checkIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M11.5 3.5L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
                {filteredIDES.length === 0 && (
                  <div className={styles.noResults}>{t.noResults}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className={styles.description}>
        {t.configureDescription}
        {isEnglish ? '. ' : ' '}
        {t.connectionModesHint}
        <a href="/ai/cloudbase-ai-toolkit/connection-modes" className={styles.templateLink}>
          {t.connectionModesLink}
        </a>
        {t.connectionModesSuffix}
      </p>
      {/* Installation Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{t.installation}</h3>
          {collapseStep1 && (
            <button
              className={styles.cardToggle}
              onClick={() => setIsStep1Expanded(!isStep1Expanded)}
            >
              <span>{isStep1Expanded ? t.showLess : t.showMore}</span>
              <svg
                className={`${styles.cardChevron} ${isStep1Expanded ? styles.cardChevronOpen : ''}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {isStep1Expanded && (
          <div className={styles.cardContent}>

            {/* Template hint for project-level MCP support */}
            {ide.supportsProjectMCP && (
              <div className={styles.templateHint}>
                <strong>{t.useTemplate}</strong> - {t.templateDescription}
                <a
                  href="/ai/cloudbase-ai-toolkit/templates"
                  className={styles.templateLink}
                >
                  {t.viewTemplates}
                </a>
              </div>
            )}

            {ide.id === 'openclaw' && (
              <div className={styles.templateHint}>
                <strong>{isEnglish ? 'Chat-based setup:' : '通过对话安装：'}</strong>
                {isEnglish ? (
                  <span> In OpenClaw, you can install CloudBase Skills through chat. If you do not need extra CloudBase rules yet, you can also start the conversation directly.</span>
                ) : (
                  <span> 在 OpenClaw 中可通过对话安装 CloudBase Skills；如果暂时不需要额外的 CloudBase 规则和工作流，也可以直接开始对话。</span>
                )}
              </div>
            )}

            {/* CodeBuddy built-in integration recommendation */}
            {ide.id === 'codebuddy' && (
              <div className={styles.templateHint}>
                <strong>{isEnglish ? 'Recommended:' : '推荐：'}</strong>
                {isEnglish ? (
                  <span> CodeBuddy IDE already includes built-in CloudBase MCP integration. Prefer the integrated setup flow first.</span>
                ) : (
                  <span>CodeBuddy IDE 已内置集成 CloudBase MCP，建议优先使用配置集成方式。</span>
                )}
                <a
                  href={isEnglish ? 'https://www.codebuddy.ai/docs/en/ide/User-guide/Integration' : 'https://www.codebuddy.ai/docs/zh/ide/User-guide/Integration'}
                  className={styles.templateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {isEnglish ? 'View BaaS integration docs' : '查看 BaaS 集成文档'}
                </a>
                {isEnglish ? (
                  <span>. If you still need manual MCP configuration, use the setup below.</span>
                ) : (
                  <span>。如需手动配置 MCP，请参考下方配置。</span>
                )}
              </div>
            )}

            {/* Trae builder-with-mcp guidance */}
            {ide.id === 'trae' && (
              <div className={styles.templateHint}>
                <strong>{isEnglish ? 'Note:' : '提示：'}</strong>
                {isEnglish ? (
                  <span> After installation, use MCP servers inside an Agent via “Builder with MCP” or “SOLO Coder”.</span>
                ) : (
                  <span> 安装完成后，请在 “Builder with MCP” 或 “SOLO Coder” 等智能体中使用。</span>
                )}
                {ide.docUrl && (
                  <a
                    href={ide.docUrl}
                    className={styles.templateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {isEnglish ? 'View docs' : '查看文档'}
                  </a>
                )}
              </div>
            )}

            {/* One-click install button */}
            {oneClickInstallUrl && (
              <div className={styles.oneClickInstall}>
                <p className={styles.oneClickLabel}>{t.oneClickInstall}:</p>
                <a
                  href={oneClickInstallUrl}
                  className={styles.oneClickButton}
                  target={(ide.id === 'github-copilot' || isProtocolInstallUrl) ? undefined : '_blank'}
                  rel={(ide.id === 'github-copilot' || isProtocolInstallUrl) ? undefined : 'noopener noreferrer'}
                  onClick={() => {
                    reportEvent({
                      name: 'IDE Selector - One Click Install',
                      ideId: ide.id,
                      eventType: 'one_click_install',
                    });
                  }}
                >
                  {ide.oneClickInstallImage ? (
                    <img
                      src={ide.oneClickInstallImage}
                      alt={`Add to ${ide.name}`}
                      className={styles.oneClickImage}
                    />
                  ) : (ide.id === 'cursor' || ide.id === 'github-copilot') ? (
                    <div className={styles.customOneClickButton}>
                      {getIconUrl(ide) && (
                        <img
                          src={getIconUrl(ide)!}
                          alt=""
                          className={`${styles.customButtonIcon} ${ide.id === 'cursor' ? styles.cursorIcon : ''}`}
                        />
                      )}
                      <span className={styles.customButtonText}>Add to {ide.name}</span>
                    </div>
                  ) : ide.id === 'trae' ? (
                    <div className={styles.customOneClickButton}>
                      {getIconUrl(ide) && (
                        <img
                          src={getIconUrl(ide)!}
                          alt=""
                          className={styles.customButtonIcon}
                        />
                      )}
                      <span className={styles.customButtonText}>Add to {ide.name}</span>
                    </div>
                  ) : (
                    <span>Add to {ide.name}</span>
                  )}
                </a>
              </div>
            )}

            {/* Additional install steps - collapsible if enabled */}
            {collapsibleInstallSteps &&
              ((ide.useCommandInsteadOfConfig && ide.installCommandDocs) ||
                (ide.cliCommand && !ide.useCommandInsteadOfConfig) ||
                (!ide.useCommandInsteadOfConfig)) && (
                <div className={styles.collapsibleSection}>
                  <button
                    className={styles.collapsibleToggle}
                    onClick={() => setShowAllInstallSteps(!showAllInstallSteps)}
                  >
                    <span>{showAllInstallSteps ? t.showLess : t.showMore}</span>
                    <svg
                      className={`${styles.collapsibleChevron} ${showAllInstallSteps ? styles.collapsibleChevronOpen : ''}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {showAllInstallSteps && (
                    <div className={styles.collapsibleContent}>
                      {/* Install command (for command-based installation) */}
                      {ide.useCommandInsteadOfConfig && ide.installCommandDocs && (
                        <div className={styles.installCommandSection}>
                          {ide.installCommandDocs.split(/\n\n/).map((section, idx) => {
                            const codeMatch = section.match(/```bash\n([^`]+)```/);
                            if (codeMatch) {
                              const textBefore = section.split('```bash')[0].trim();
                              const platformMatch = textBefore.match(/\*\*([^*]+)\*\*/);
                              return (
                                <div key={idx} className={styles.installCommandBlock}>
                                  {textBefore && (
                                    <p className={styles.installCommandLabel}>
                                      {platformMatch ? <strong>{platformMatch[1]}</strong> : textBefore}
                                    </p>
                                  )}
                                  <div className={styles.codeBlock}>
                                    <div className={styles.codeHeader}>
                                      <span className={styles.codeLanguage}>bash</span>
                                      <button
                                        className={styles.copyCodeButton}
                                        onClick={async () => {
                                          await navigator.clipboard.writeText(codeMatch[1].trim());
                                          setCopiedCode(true);
                                          setTimeout(() => setCopiedCode(false), 2000);
                                        }}
                                        title={t.copyCode}
                                      >
                                        {copiedCode ? (
                                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                          </svg>
                                        ) : (
                                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                                            <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                    <pre className={styles.codeContent}>
                                      <code>{codeMatch[1].trim()}</code>
                                    </pre>
                                  </div>
                                </div>
                              );
                            }
                            if (section.trim()) {
                              return (
                                <p key={idx} className={styles.installCommandText}>
                                  {section.split(/\*\*([^*]+)\*\*/).map((part, i) =>
                                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                                  )}
                                </p>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {/* CLI command */}
                      {ide.cliCommand && !ide.useCommandInsteadOfConfig && (
                        <div className={styles.cliSection}>
                          <p className={styles.cliLabel}>{t.cliCommand}:</p>
                          <div className={styles.cliCommandBlock}>
                            <code className={styles.cliCommandText}>{ide.cliCommand}</code>
                            <button
                              className={styles.copyCliButton}
                              onClick={handleCopyCli}
                              title={t.copyCode}
                            >
                              {copiedCli ? (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                  <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                  <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                                  <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              )}
                            </button>
                          </div>
                          {ide.alternativeConfig && (
                            <p className={styles.alternativeConfig}>{ide.alternativeConfig}</p>
                          )}
                        </div>
                      )}

                      {/* Manual configuration */}
                      {!ide.useCommandInsteadOfConfig && (getOneClickInstallUrl() || ide.cliCommand) && (
                        <p className={styles.orManualConfig}>{t.orManualConfig}:</p>
                      )}

                      {!ide.useCommandInsteadOfConfig && (
                        <>
                          <p className={styles.configHint}>
                            {ide.alternativeConfig ? (
                              ide.alternativeConfig
                            ) : (
                              <>
                                {t.orAddConfig} <code className={styles.inlineCode}>{ide.configPath}</code>:
                              </>
                            )}
                          </p>

                          {/* Code block with syntax highlighting */}
                          <div className={styles.codeBlock}>
                            <div className={styles.codeHeader}>
                              <span className={styles.codeLanguage}>json</span>
                              <button
                                className={styles.copyCodeButton}
                                onClick={handleCopyCode}
                                title={t.copyCode}
                              >
                                {copiedCode ? (
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                                    <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            <pre className={styles.codeContent}>
                              <code>{highlightJSON(ide.configExample)}</code>
                            </pre>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

            {/* Additional install steps - always show if not collapsible */}
            {!collapsibleInstallSteps && (
              <>
                {/* Install command (for command-based installation) */}
                {ide.useCommandInsteadOfConfig && ide.installCommandDocs && (
                  <div className={styles.installCommandSection}>
                    {ide.installCommandDocs.split(/\n\n/).map((section, idx) => {
                      const codeMatch = section.match(/```bash\n([^`]+)```/);
                      if (codeMatch) {
                        const textBefore = section.split('```bash')[0].trim();
                        const platformMatch = textBefore.match(/\*\*([^*]+)\*\*/);
                        return (
                          <div key={idx} className={styles.installCommandBlock}>
                            {textBefore && (
                              <p className={styles.installCommandLabel}>
                                {platformMatch ? <strong>{platformMatch[1]}</strong> : textBefore}
                              </p>
                            )}
                            <div className={styles.codeBlock}>
                              <div className={styles.codeHeader}>
                                <span className={styles.codeLanguage}>bash</span>
                                <button
                                  className={styles.copyCodeButton}
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(codeMatch[1].trim());
                                    setCopiedCode(true);
                                    setTimeout(() => setCopiedCode(false), 2000);
                                  }}
                                  title={t.copyCode}
                                >
                                  {copiedCode ? (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                      <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  ) : (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                      <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                                      <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                              <pre className={styles.codeContent}>
                                <code>{codeMatch[1].trim()}</code>
                              </pre>
                            </div>
                          </div>
                        );
                      }
                      if (section.trim()) {
                        return (
                          <p key={idx} className={styles.installCommandText}>
                            {section.split(/\*\*([^*]+)\*\*/).map((part, i) =>
                              i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                            )}
                          </p>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}

                {/* CLI command */}
                {ide.cliCommand && !ide.useCommandInsteadOfConfig && (
                  <div className={styles.cliSection}>
                    <p className={styles.cliLabel}>{t.cliCommand}:</p>
                    <div className={styles.cliCommandBlock}>
                      <code className={styles.cliCommandText}>{ide.cliCommand}</code>
                      <button
                        className={styles.copyCliButton}
                        onClick={handleCopyCli}
                        title={t.copyCode}
                      >
                        {copiedCli ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {ide.alternativeConfig && (
                      <p className={styles.alternativeConfig}>{ide.alternativeConfig}</p>
                    )}
                  </div>
                )}

                {/* Manual configuration */}
                {!ide.useCommandInsteadOfConfig && (getOneClickInstallUrl() || ide.cliCommand) && (
                  <p className={styles.orManualConfig}>{t.orManualConfig}:</p>
                )}

                {!ide.useCommandInsteadOfConfig && (
                  <>
                    <p className={styles.configHint}>
                      {ide.alternativeConfig ? (
                        ide.alternativeConfig
                      ) : (
                        <>
                          {t.orAddConfig} <code className={styles.inlineCode}>{ide.configPath}</code>:
                        </>
                      )}
                    </p>

                    {/* Code block with syntax highlighting */}
                    <div className={styles.codeBlock}>
                      <div className={styles.codeHeader}>
                        <span className={styles.codeLanguage}>json</span>
                        <button
                          className={styles.copyCodeButton}
                          onClick={handleCopyCode}
                          title={t.copyCode}
                        >
                          {copiedCode ? (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <pre className={styles.codeContent}>
                        <code>{highlightJSON(ide.configExample)}</code>
                      </pre>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Help link */}
            {ide.docUrl && (
              <div className={styles.helpSection}>
                <span className={styles.helpText}>{t.needHelp}</span>
                <a
                  href={ide.docUrl}
                  className={styles.helpLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.viewDocs} {ide.name} {t.docs}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Verify connection */}
      <div className={styles.verifyCard}>
        <h3 className={styles.verifyTitle}>{t.step2Verify}</h3>
        <p className={styles.verifyDescription}>{t.verifyDescription}</p>
        <div className={styles.promptWrapper}>
          <div className={styles.promptLabel}>prompt</div>
          <div className={styles.promptContent}>
            <code className={styles.promptText}>
              {installPrompt}
            </code>
            <div className={styles.promptActions}>
              {getIDEDeepLink() && (
                <button
                  onClick={handleOpenIDE}
                  className={styles.openIDEButton}
                  title={getOpenInIDEText(ide?.name)}
                >
                  {getIconUrl(ide) && (
                    <img
                      src={getIconUrl(ide)!}
                      alt=""
                      className={styles.openIDEIcon}
                    />
                  )}
                  <span>{getOpenInIDEText(ide?.name)}</span>
                </button>
              )}
              <button
                onClick={handleCopyPrompt}
                className={styles.copyPromptButton}
                title={t.copyPrompt}
              >
                {copiedPrompt ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {/* Second prompt row - customPrompt if provided, otherwise random prompt */}
          {secondPrompt && (
            <div className={styles.promptContent}>
              <code className={styles.promptText}>
                {secondPromptWithSkills}
              </code>
              <div className={styles.promptActions}>
                {!customPrompt && (
                  <button
                    onClick={handleRefreshPrompt}
                    className={styles.refreshPromptButton}
                    title={t.refreshPrompt}
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
                )}
                {getIDEDeepLink(secondPromptWithSkills) && (
                  <button
                    onClick={() => handleOpenIDE(secondPromptWithSkills)}
                    className={styles.openIDEButton}
                    title={getOpenInIDEText(ide?.name)}
                  >
                    {getIconUrl(ide) && (
                      <img
                        src={getIconUrl(ide)!}
                        alt=""
                        className={styles.openIDEIcon}
                      />
                    )}
                    <span>{getOpenInIDEText(ide?.name)}</span>
                  </button>
                )}
                <button
                  onClick={handleCopySecondPrompt}
                  className={styles.copyPromptButton}
                  title={t.copyPrompt}
                >
                  {copiedSecondPrompt ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 11V3C3 2.44772 3.44772 2 4 2H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
