import Link from '@docusaurus/Link';
import React from 'react';
import styles from './IDEIconGrid.module.css';

interface IDE {
  id: string;
  name: string;
  platform: string;
  iconSlug?: string;
  iconUrl?: string;
  docUrl?: string;
}

// Order by current popularity / CloudBase ecosystem traction (hot tools first).
const IDES: IDE[] = [
  {
    id: 'wechat-devtools',
    name: '微信开发者工具',
    platform: '微信开发者工具',
    iconUrl: '/img/ide-logos/wechat-devtools.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/wechat-devtools',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    platform: '独立 IDE',
    iconUrl: '/img/ide-logos/workbuddy.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/workbuddy',
  },
  {
    id: 'kimi-code',
    name: 'Kimi Code',
    platform: '命令行工具',
    iconUrl: '/img/ide-logos/kimi-code.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/kimi-code',
  },
  {
    id: 'kimi-work',
    name: 'Kimi Work',
    platform: '桌面应用',
    iconUrl: '/img/ide-logos/kimi-code.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/kimi-code',
  },
  {
    id: 'zcode',
    name: 'ZCode',
    platform: '独立 IDE',
    iconUrl: '/img/ide-logos/zcode.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/zcode',
  },
  {
    id: 'doubao',
    name: '豆包',
    platform: '桌面端 / 网页版',
    iconUrl: '/img/ide-logos/doubao.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/doubao',
  },
  {
    id: 'minimax-code',
    name: 'MiniMax Code',
    platform: '桌面端 / 终端 CLI',
    iconUrl: '/img/ide-logos/minimax-code.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/minimax-code',
  },
  {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
    platform: '桌面应用',
    iconUrl: '/img/ide-logos/deepseek-harness.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/deepseek-harness',
  },
  {
    id: 'codex-app',
    name: 'Codex App',
    platform: '独立应用',
    iconUrl: '/img/ide-logos/codex-app.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/codex',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    platform: '独立 IDE',
    iconSlug: 'cursor',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/cursor',
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    platform: 'VS Code、JetBrains、微信开发者工具',
    iconUrl: '/img/ide-logos/codebuddy.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/codebuddy',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    platform: '命令行工具',
    iconSlug: 'claude',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/claude-code',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    platform: '命令行工具',
    iconUrl: '/img/ide-logos/openclaw.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/openclaw',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    platform: '命令行工具',
    iconUrl: '/img/ide-logos/opencode.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/opencode',
  },
  {
    id: 'trae',
    name: 'Trae',
    platform: '独立 IDE',
    iconUrl: '/img/ide-logos/trae.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/trae',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    platform: '独立 IDE',
    iconUrl: '/img/ide-logos/qoder.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/qoder',
  },
  {
    id: 'windsurf',
    name: 'WindSurf',
    platform: '独立 IDE',
    iconSlug: 'windsurf',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/windsurf',
  },
  {
    id: 'github-copilot',
    name: 'VSCode',
    platform: 'VS Code 插件',
    iconUrl: '/img/ide-logos/github-copilot.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/github-copilot',
  },
  {
    id: 'codebuddy-code',
    name: 'CodeBuddy Code',
    platform: '命令行工具',
    iconUrl: '/img/ide-logos/codebuddy.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/codebuddy-code',
  },
  {
    id: 'tongyi-lingma',
    name: '通义灵码',
    platform: 'VS Code、JetBrains 插件',
    iconUrl: '/img/ide-logos/tongyi-lingma.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/tongyi-lingma',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    platform: '命令行工具',
    iconSlug: 'qwen',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/qwen-code',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    platform: '命令行工具',
    iconSlug: 'gemini',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/gemini-cli',
  },
  {
    id: 'cline',
    name: 'Cline',
    platform: 'VS Code 插件',
    iconSlug: 'cline',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/cline',
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    platform: '独立 IDE',
    iconUrl: '/img/ide-logos/antigravity.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/antigravity',
  },
  {
    id: 'roocode',
    name: 'RooCode',
    platform: 'VS Code 插件',
    iconUrl: '/img/ide-logos/roocode.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/roocode',
  },
  {
    id: 'augment-code',
    name: 'Augment Code',
    platform: 'VS Code、JetBrains 插件',
    iconUrl: '/img/ide-logos/augment-code.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/augment-code',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    platform: '独立 IDE',
    iconUrl: '/img/ide-logos/kiro.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/kiro',
  },
  {
    id: 'iflow-cli',
    name: 'iFlow CLI',
    platform: '命令行工具',
    iconUrl: '/img/ide-logos/iflow-cli.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/iflow-cli',
  },
  {
    id: 'openai-codex-cli',
    name: 'Codex CLI',
    platform: '命令行工具',
    iconUrl: '/img/ide-logos/openai-codex-cli.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/openai-codex-cli',
  },
  {
    id: 'baidu-comate',
    name: '文心快码',
    platform: 'VS Code、JetBrains 插件',
    iconUrl: '/img/ide-logos/baidu-comate.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/baidu-comate',
  },
]

const iconsWithColor = new Set(['claude', 'gemini', 'baidu', 'alibaba', 'qwen', 'bytedance', 'tencent']);

const getIconUrl = (ide: IDE) => {
  if (ide.iconUrl) return ide.iconUrl;
  if (ide.iconSlug) {
    const baseUrl = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@latest/light';
    if (iconsWithColor.has(ide.iconSlug)) {
      return `${baseUrl}/${ide.iconSlug}-color.png`;
    }
    return `${baseUrl}/${ide.iconSlug}.png`;
  }
  return null;
};

export default function IDEIconGrid() {
  return (
    <div className={styles.grid}>
      {IDES.map((ide) => {
        const iconUrl = getIconUrl(ide);
        return (
          <Link
            key={ide.id}
            to={ide.docUrl || '#'}
            className={styles.card}
          >
            {iconUrl && (
              <img
                src={iconUrl}
                alt={ide.name}
                className={styles.icon}
              />
            )}
            <div className={styles.name}>{ide.name}</div>
          </Link>
        );
      })}
    </div>
  );
}
