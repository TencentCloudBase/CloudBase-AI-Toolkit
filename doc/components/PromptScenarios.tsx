import Link from '@docusaurus/Link';
import React, { useMemo } from 'react';
import styles from './PromptScenarios.module.css';
import promptsData from './prompts.json';

interface PromptItem {
  id: string;
  title: string;
  description: string;
  shortDescription?: string;
  category: string;
  order: number;
  prompts: string[];
}

interface CategoryInfo {
  id: string;
  label: string;
  order: number;
}

// Category mapping from config.yaml
const categoryMap: Record<string, CategoryInfo> = {
  auth: { id: 'auth', label: '身份认证', order: 1 },
  database: { id: 'database', label: '数据库', order: 2 },
  backend: { id: 'backend', label: '后端开发', order: 3 },
  frontend: { id: 'frontend', label: '应用集成', order: 4 },
  ai: { id: 'ai', label: 'AI', order: 5 },
  tools: { id: 'tools', label: '开发工具', order: 6 },
};

const prompts = promptsData as PromptItem[];

export default function PromptScenarios() {
  // Group prompts by category and sort
  const groupedScenarios = useMemo(() => {
    const grouped = prompts.reduce((acc, prompt) => {
      const categoryInfo = categoryMap[prompt.category];
      if (!categoryInfo) return acc;
      
      const categoryLabel = categoryInfo.label;
      if (!acc[categoryLabel]) {
        acc[categoryLabel] = {
          order: categoryInfo.order,
          items: [],
        };
      }
      acc[categoryLabel].items.push({
        ...prompt,
        docUrl: `/ai/cloudbase-ai-toolkit/prompts/${prompt.id}`,
      });
      return acc;
    }, {} as Record<string, { order: number; items: Array<PromptItem & { docUrl: string }> }>);

    // Sort items within each category by order
    Object.keys(grouped).forEach((category) => {
      grouped[category].items.sort((a, b) => a.order - b.order);
    });

    return grouped;
  }, []);

  // Sort categories by order
  const sortedCategories = Object.entries(groupedScenarios).sort(
    ([, a], [, b]) => (a as { order: number }).order - (b as { order: number }).order
  );

  return (
    <div className={styles.container}>
      {sortedCategories.map(([category, group]) => {
        const { items } = group as { order: number; items: Array<PromptItem & { docUrl: string }> };
        return (
          <div key={category} className={styles.category}>
            <h3 className={styles.categoryTitle}>{category}</h3>
            <div className={styles.grid}>
              {items.map((scenario) => (
                <Link
                  key={scenario.id}
                  to={scenario.docUrl}
                  className={styles.card}
                >
                <div className={styles.content}>
                  <div className={styles.title}>{scenario.title}</div>
                  <div className={styles.description}>{scenario.shortDescription || scenario.description}</div>
                </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
