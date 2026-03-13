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

const IDES: IDE[] = [
  {
    id: 'wechat-devtools',
    name: '微信开发者工具',
    platform: '微信开发者工具',
    iconUrl: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/assets/wechat-devtools-logo.png?v=2',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/wechat-devtools',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    platform: '命令行工具',
    iconUrl: 'https://openclaw.ai/favicon.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/openclaw',
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
    iconUrl: 'https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/codebuddy',
  },
  {
    id: 'github-copilot',
    name: 'VSCode',
    platform: 'VS Code 插件',
    iconUrl: 'https://code.visualstudio.com/favicon.ico',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/github-copilot',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    platform: '独立 IDE',
    iconUrl: 'https://g.alicdn.com/qbase/qoder/0.0.183/favIcon.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/qoder',
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    platform: '独立 IDE',
    iconUrl: 'https://antigravity.google/assets/image/antigravity-logo.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/antigravity',
  },
  {
    id: 'windsurf',
    name: 'WindSurf',
    platform: '独立 IDE',
    iconSlug: 'windsurf',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/windsurf',
  },
  {
    id: 'cline',
    name: 'Cline',
    platform: 'VS Code 插件',
    iconSlug: 'cline',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/cline',
  },
  {
    id: 'trae',
    name: 'Trae',
    platform: '独立 IDE',
    iconUrl: 'https://lf-cdn.trae.ai/obj/trae-ai-sg/trae_website_prod/favicon.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/trae',
  },
  {
    id: 'tongyi-lingma',
    name: '通义灵码',
    platform: 'VS Code、JetBrains 插件',
    iconUrl: 'https://img.alicdn.com/imgextra/i1/O1CN01BN6Jtc1lCfJNviV7H_!!6000000004783-2-tps-134-133.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/tongyi-lingma',
  },
  {
    id: 'baidu-comate',
    name: '文心快码',
    platform: 'VS Code、JetBrains 插件',
    iconUrl: 'https://comate.baidu.com/images/favicon.ico',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/baidu-comate',
  },
  {
    id: 'roocode',
    name: 'RooCode',
    platform: 'VS Code 插件',
    iconUrl: 'https://docs.roocode.com/img/favicon.ico',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/roocode',
  },
  {
    id: 'augment-code',
    name: 'Augment Code',
    platform: 'VS Code、JetBrains 插件',
    iconUrl: 'https://www.augmentcode.com/favicon.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/augment-code',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    platform: '命令行工具',
    iconSlug: 'claude',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/claude-code',
  },
  {
    id: 'codebuddy-code',
    name: 'CodeBuddy Code',
    platform: '命令行工具',
    iconUrl: 'https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/codebuddy-code',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    platform: '命令行工具',
    iconSlug: 'gemini',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/gemini-cli',
  },
  {
    id: 'openai-codex-cli',
    name: 'OpenAI Codex CLI',
    platform: '命令行工具',
    iconSlug: 'openai',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/openai-codex-cli',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    platform: '命令行工具',
    iconSlug: 'qwen',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/qwen-code',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    platform: '命令行工具',
    iconUrl: 'https://avatars.githubusercontent.com/u/66570915?s=200&v=4',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/opencode',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    platform: '独立 IDE',
    iconUrl: 'https://kiro.dev/favicon.ico',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/kiro',
  },
  {
    id: 'iflow-cli',
    name: 'iFlow CLI',
    platform: '命令行工具',
    iconUrl: 'https://img.alicdn.com/imgextra/i1/O1CN01nulwex1q7Eq1TVqUh_!!6000000005448-55-tps-32-32.svg',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/iflow-cli',
  },
  {
    id: 'cloudbase-cli',
    name: 'CloudBase CLI',
    platform: '命令行工具',
    iconUrl: 'https://docs.cloudbase.net/img/favicon.png',
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/cloudbase-cli',
  },
];

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
