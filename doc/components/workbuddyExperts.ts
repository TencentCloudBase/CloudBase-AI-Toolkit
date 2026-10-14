/**
 * WorkBuddy 专家中心里的 CloudBase 专家。
 *
 * guideUrl 是对外可分享的资产链接：先打开专家详情页，再由页面引导安装，
 * 没装过这个专家的用户也能打开。（`workbuddy://` 深链对未安装用户没有反应，不能对外用。）
 *
 * 专属页和 IDE 选择器都从这里读，换渠道时只改这个文件。
 */

export interface WorkBuddyExpert {
  /** 专家包目录名，对应 plugins/experts/<slug> */
  slug: string;
  /** 客户端里显示的专家名 */
  name: string;
  /** 一句话说明它能做什么 */
  summary: string;
  /** 对外可分享的专家入口 */
  guideUrl: string;
}

export const WORKBUDDY_EXPERTS: WorkBuddyExpert[] = [
  {
    slug: 'cloudbase-webdev-expert',
    name: '腾讯云 CloudBase 全栈工程师',
    summary: '前端页面、PostgreSQL 与 RLS 行级权限、云函数，覆盖从需求到部署上线的完整链路',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=INWm8JffziaPUu03h45pN0&sig=hlwCkDQGN5r_KKLW',
  },
  {
    slug: 'miniprogram-clouddev-expert',
    name: '微信小程序全栈开发专家',
    summary: '云函数、云数据库、消息推送、编译预览部署，支持个人主体虚拟支付接入',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=Qm1h3644twDogAMPR5teEt&sig=fnGdahbxTKljsQBG',
  },
  {
    slug: 'cloudbase-workbench-expert',
    name: '个人工作台专家',
    summary: '打卡、清单、记账、周报这类日常记录，做成数据存云端的在线小应用',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=WXYyw7eX488WAAB8RZD23L&sig=hDqX0Hhl2v7UlEXW',
  },
  {
    slug: 'cloudbase-collect-form-expert',
    name: '小工具开发专家',
    summary: '报名、登记、资料收集这类场景，生成表单、部署上线、出二维码，发起人实时看汇总',
    guideUrl:
      'https://www.workbuddy.cn/share/asset?shareCode=uFHTgXfFTyoc1KFoKTE9ZD&sig=0GfHH0Vp_pZHHJ2Q',
  },
];

/** 最通用的那个，选择器里只放它一条 */
export const WORKBUDDY_FEATURED_EXPERT = WORKBUDDY_EXPERTS[0];

/** 配置指南页，选择器里「其余 3 个见…」指向它 */
export const WORKBUDDY_GUIDE_URL = '/ai/cloudbase-ai-toolkit/ide-setup/workbuddy';
