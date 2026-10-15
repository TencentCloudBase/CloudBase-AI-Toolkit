import React from 'react';
import styles from './WorkBuddyExpertCards.module.css';
import { WORKBUDDY_EXPERTS, type WorkBuddyExpertChannel } from './workbuddyExperts';

/**
 * 4 个 CloudBase 专家的卡片。
 *
 * 文章与配置指南共用：内容来自 workbuddyExperts.ts，改文案只改那一处。
 * `lang` 决定中文还是英文那份说法，`channel` 决定用哪一套推广链接
 * （渠道标签创建时绑定，交叉用会让推广归因失真）。
 *
 * 整张卡片就是一个链接，点哪儿都能进专家详情页。
 */
export default function WorkBuddyExpertCards({
  lang = 'zh',
  channel = 'docs',
}: {
  lang?: 'zh' | 'en';
  channel?: WorkBuddyExpertChannel;
}) {
  return (
    <div className={styles.grid}>
      {WORKBUDDY_EXPERTS.map((expert) => (
        <a
          key={expert.slug}
          className={styles.card}
          href={channel === 'blog' ? expert.blogUrl : expert.guideUrl}
          target="_blank"
          rel="noreferrer"
        >
          <img className={styles.avatar} src={expert.avatarUrl} alt="" width={40} height={40} loading="lazy" />
          <span className={styles.body}>
            <span className={styles.name}>{lang === 'en' ? expert.nameEn : expert.name}</span>
            <span className={styles.summary}>{lang === 'en' ? expert.summaryEn : expert.summary}</span>
            <span className={styles.tags}>
              {(lang === 'en' ? expert.tagsEn : expert.tags).map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
