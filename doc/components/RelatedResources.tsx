import Link from '@docusaurus/Link';
import React from 'react';
import styles from './RelatedResources.module.css';

interface RelatedResourcesProps {
  ideName?: string;
  ideDocUrl?: string;
}

export default function RelatedResources({ ideName, ideDocUrl }: RelatedResourcesProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>相关资源</h2>
      <ul className={styles.list}>
        <li>
          <Link to="/ai/cloudbase-ai-toolkit/tutorials">视频教程</Link>
          <span className={styles.description}> - 观看视频教程和实战案例</span>
        </li>
        <li>
          <Link to="/ai/cloudbase-ai-toolkit/development">开发指南</Link>
          <span className={styles.description}> - 深入了解开发最佳实践</span>
        </li>
        <li>
          <Link to="/ai/cloudbase-ai-toolkit/examples">使用案例</Link>
          <span className={styles.description}> - 查看实际应用案例</span>
        </li>
        <li>
          <Link to="/ai/cloudbase-ai-toolkit/mcp-tools">MCP 工具</Link>
          <span className={styles.description}> - 了解所有可用工具</span>
        </li>
        <li>
          <Link to="/ai/cloudbase-ai-toolkit/faq">常见问题</Link>
          <span className={styles.description}> - 查看常见问题解答</span>
        </li>
        {ideName && ideDocUrl && (
          <li>
            <Link to={ideDocUrl}>{ideName} 官方文档</Link>
            <span className={styles.description}> - {ideName} MCP 官方文档</span>
          </li>
        )}
      </ul>
    </div>
  );
}

