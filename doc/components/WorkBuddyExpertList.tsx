import React from 'react';
import { WORKBUDDY_EXPERTS } from './workbuddyExperts';

/**
 * 4 个 CloudBase 专家的可点列表。
 *
 * 文档页与上架博客共用这一个组件：条目、名称与说明都来自 workbuddyExperts.ts，
 * 因此改文案只改那一处。`lang` 决定用中文还是英文那份说法。
 */
export default function WorkBuddyExpertList({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  return (
    <ul>
      {WORKBUDDY_EXPERTS.map((expert) => (
        <li key={expert.slug}>
          <a href={expert.guideUrl} target="_blank" rel="noreferrer">
            {lang === 'en' ? expert.nameEn : expert.name}
          </a>
          {' —— '}
          {lang === 'en' ? expert.summaryEn : expert.summary}
        </li>
      ))}
    </ul>
  );
}
