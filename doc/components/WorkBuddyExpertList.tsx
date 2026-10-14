import React from 'react';
import { WORKBUDDY_EXPERTS, type WorkBuddyExpertChannel } from './workbuddyExperts';

/** 链接按渠道区分，交叉使用会让推广归因失真 —— 见 workbuddyExperts.ts 顶部说明 */
export type { WorkBuddyExpertChannel };

/**
 * 4 个 CloudBase 专家的可点列表。
 *
 * 文档页与上架博客共用这一个组件：条目、名称与说明都来自 workbuddyExperts.ts，
 * 因此改文案只改那一处。`lang` 决定用中文还是英文那份说法，
 * `channel` 决定用哪一套推广链接（文档站默认，博客传 blog）。
 */
export default function WorkBuddyExpertList({
  lang = 'zh',
  channel = 'docs',
}: {
  lang?: 'zh' | 'en';
  channel?: WorkBuddyExpertChannel;
}) {
  return (
    <ul>
      {WORKBUDDY_EXPERTS.map((expert) => (
        <li key={expert.slug}>
          <a
            href={channel === 'blog' ? expert.blogUrl : expert.guideUrl}
            target="_blank"
            rel="noreferrer"
          >
            {lang === 'en' ? expert.nameEn : expert.name}
          </a>
          {' —— '}
          {lang === 'en' ? expert.summaryEn : expert.summary}
        </li>
      ))}
    </ul>
  );
}
