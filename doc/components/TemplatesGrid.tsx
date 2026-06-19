import Link from '@docusaurus/Link';
import React from 'react';
import styles from './TemplatesGrid.module.css';

interface Template {
  id: string;
  title: string;
  description: string;
  category: string;
  downloadUrl: string;
  githubUrl: string;
  icon: string;
}

const templates: Template[] = [
  {
    id: 'miniprogram',
    title: '微信小程序',
    description: '小程序基础配置，包含云开发集成',
    category: '新项目推荐',
    downloadUrl: 'https://static.cloudbase.net/cloudbase-examples/miniprogram-cloudbase-miniprogram-template.zip?v=2025053001',
    githubUrl: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/miniprogram/cloudbase-miniprogram-template',
    icon: '📱',
  },
  {
    id: 'react',
    title: 'React Web 应用',
    description: '现代化的 React 全栈应用模板',
    category: '新项目推荐',
    downloadUrl: 'https://static.cloudbase.net/cloudbase-examples/web-cloudbase-react-template.zip?v=2025053001',
    githubUrl: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/web/cloudbase-react-template',
    icon: '⚛️',
  },
  {
    id: 'vue',
    title: 'Vue Web 应用',
    description: '现代化的 Vue 全栈应用模板',
    category: '新项目推荐',
    downloadUrl: 'https://static.cloudbase.net/cloudbase-examples/web-cloudbase-vue-template.zip?v=2025053001',
    githubUrl: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/web/cloudbase-vue-template',
    icon: '💚',
  },
  {
    id: 'uniapp',
    title: 'UniApp 跨端应用',
    description: '可编译到 H5 和微信小程序',
    category: '新项目推荐',
    downloadUrl: 'https://static.cloudbase.net/cloudbase-examples/universal-cloudbase-uniapp-template.zip?v=2025053001',
    githubUrl: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/universal/cloudbase-uniapp-template',
    icon: '🌐',
  },
  {
    id: 'rules',
    title: 'AI 规则通用模板',
    description: '内置 CloudBase AI 规则和 MCP',
    category: '新项目推荐',
    downloadUrl: 'https://static.cloudbase.net/cloudbase-examples/web-cloudbase-project.zip',
    githubUrl: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/web/cloudbase-project',
    icon: '🤖',
  },
];

export default function TemplatesGrid() {
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {templates.map((template) => (
          <div key={template.id} className={styles.card}>
            <div className={styles.content}>
              <div className={styles.header}>
                <span className={styles.icon}>{template.icon}</span>
                <h3 className={styles.title}>{template.title}</h3>
              </div>
              <p className={styles.description}>{template.description}</p>
              <div className={styles.actions}>
                <a
                  href={template.downloadUrl}
                  className={styles.downloadButton}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <span className={styles.buttonIcon}>⬇️</span>
                  下载
                </a>
                <Link
                  to={template.githubUrl}
                  className={styles.githubButton}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.buttonIcon}>🔗</span>
                  GitHub
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

