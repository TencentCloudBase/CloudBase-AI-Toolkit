/**
 * WorkBuddy 专家中心里的 CloudBase 专家。
 *
 * 链接都是对外可分享的资产链接：先打开专家详情页，再由页面引导安装，
 * 没装过这个专家的用户也能打开。（`workbuddy://` 深链对未安装用户没有反应，不能对外用。）
 *
 * ⚠️ 推广链接的渠道标签在创建时绑定、之后改不了，用于「运营数据 → 推广效果」按渠道
 * 拆曝光量与安装量。**交叉使用会让归因失真**，所以每个渠道各存一条：
 *   - guideUrl → 云开发文档站 · 安装指引
 *   - blogUrl  → 博客文章
 * 链接清单（4 个专家 × 3 个渠道）另存于推广管理 `open.workbuddy.cn/growth`；
 * 「云开发控制台」那一套只在该控制台侧使用，站内不用，所以不放在这里。
 *
 * 专属页、IDE 选择器、上架博客都从这里读，换渠道时只改这个文件。
 * 英文侧的 name/summary 也放在这里：英文页面与英文博客共用同一份，避免两处写法各走各的。
 */

/** 推广渠道。链接与渠道一一绑定，交叉使用会让归因失真 —— 所以谁用都要显式声明自己在哪。 */
export type WorkBuddyExpertChannel = 'docs' | 'blog';

export interface WorkBuddyExpert {
  /** 专家包目录名，对应 plugins/experts/<slug> */
  slug: string;
  /** 客户端里显示的专家名 */
  name: string;
  /** 一句话说明它能做什么 */
  summary: string;
  /** 英文页面里显示的专家名（专家中心里是中文名，这里是英文读者看的说法） */
  nameEn: string;
  /** 英文页面里的一句话说明 */
  summaryEn: string;
  /** 卡片上的头像（CDN 缩略图，约 3KB） */
  avatarUrl: string;
  /** 卡片上的标签，取自 WorkBuddy 专家详情页 */
  tags: string[];
  /** 英文页面上的标签 */
  tagsEn: string[];
  /** 文档站 · 安装指引渠道的分享链接 */
  guideUrl: string;
  /** 博客文章渠道的分享链接 */
  blogUrl: string;
}

/**
 * 头像在 WorkBuddy 的素材 CDN 上，走它的图片处理接口取缩略图：
 * 原图 512×512、两三百 KB，缩到 120×120 webp 后每张约 3KB。
 * 换头像时文件名会变，这里要跟着改。
 */
const AVATAR_BASE =
  'https://codebuddy-platform-1258344699.cos.accelerate.myqcloud.com/public/0705ccd0-3283-42a0-a7c6-0379bd7c145a/avatar/expert/';
const AVATAR_THUMB = '?imageMogr2/thumbnail/120x120/format/webp/quality/80';

export const WORKBUDDY_EXPERTS: WorkBuddyExpert[] = [
  {
    slug: 'cloudbase-webdev-expert',
    name: '腾讯云 CloudBase 全栈工程师',
    summary: '覆盖场景最广：网站与业务系统、PostgreSQL 与行级权限、云函数、AI 接入，从需求到部署上线',
    nameEn: 'Full-Stack Engineer',
    summaryEn:
      'The broadest one: web apps and business systems, PostgreSQL with row-level security, cloud functions, and AI integration — the full path from requirement to deployed app.',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=INWm8JffziaPUu03h45pN0&sig=hlwCkDQGN5r_KKLW',
    blogUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=wM3m81MktOguDC9b5xWPnw&sig=lMtJBsGcAEMuNxKg',
    avatarUrl: `${AVATAR_BASE}eza_dd300cec-f74.png${AVATAR_THUMB}`,
    tags: ['数据库', '业务系统', 'SaaS'],
    tagsEn: ['Database', 'Business apps', 'SaaS'],
  },
  {
    slug: 'miniprogram-clouddev-expert',
    name: '微信小程序全栈开发专家',
    summary: '云函数、云数据库、消息推送、AI 接入、编译预览部署，支持虚拟支付',
    nameEn: 'Mini Program Developer',
    summaryEn:
      'Cloud functions, cloud database, message push, AI integration, and build-preview-deploy — with virtual payment support.',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=Qm1h3644twDogAMPR5teEt&sig=fnGdahbxTKljsQBG',
    blogUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=GYWjuKdIhAsp512ZFKMJHT&sig=6tTh6UVxXyE21HoA',
    avatarUrl: `${AVATAR_BASE}eza_3cdb547a-535.png${AVATAR_THUMB}`,
    tags: ['微信小程序', '后端开发', '虚拟支付'],
    tagsEn: ['Mini Program', 'Backend', 'Virtual payment'],
  },
  {
    slug: 'cloudbase-workbench-expert',
    name: '个人工作台专家',
    summary: '打卡、清单、记账、周报这类日常记录，做成数据存云端的在线小应用',
    nameEn: 'Personal Workbench Expert',
    summaryEn:
      'Habit tracking, checklists, budgeting, weekly reports: everyday records turned into a small online app stored in the cloud.',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=WXYyw7eX488WAAB8RZD23L&sig=hDqX0Hhl2v7UlEXW',
    blogUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=kA2Cqf4GPzoXKPfVwSAM7W&sig=ar4YYtGN_NqORm9L',
    avatarUrl: `${AVATAR_BASE}eza_f89a0556-dbc.png${AVATAR_THUMB}`,
    tags: ['工作台', '打卡', '清单'],
    tagsEn: ['Workbench', 'Check-ins', 'Checklists'],
  },
  {
    slug: 'cloudbase-collect-form-expert',
    name: '小工具开发专家',
    summary: '报名、登记、资料收集这类场景，生成表单、部署上线、出二维码，发起人实时看汇总',
    nameEn: 'Small Tool Builder',
    summaryEn:
      'Sign-ups, registration, and data collection: generate a form, deploy it, get a QR code, and watch responses arrive.',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=uFHTgXfFTyoc1KFoKTE9ZD&sig=0GfHH0Vp_pZHHJ2Q',
    blogUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=vlYYLRZAmiz7UV9cFiMRwk&sig=FNTNKhCPFWGreiyR',
    avatarUrl: `${AVATAR_BASE}eza_4094e4b2-c53.png${AVATAR_THUMB}`,
    tags: ['表单', '收集表', '问卷'],
    tagsEn: ['Forms', 'Collection', 'Questionnaire'],
  },
];

/** 最通用的那个，选择器里只放它一条 */
export const WORKBUDDY_FEATURED_EXPERT = WORKBUDDY_EXPERTS[0];

/** 配置指南页，选择器里「其余 3 个见…」指向它 */
export const WORKBUDDY_GUIDE_URL = '/ai/cloudbase-ai-toolkit/ide-setup/workbuddy';
