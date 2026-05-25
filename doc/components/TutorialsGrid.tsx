import Link from '@docusaurus/Link';
import { useMemo, useState } from 'react';
import styles from './TutorialsGrid.module.css';

interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
  type: 'article' | 'video' | 'project';
  thumbnail?: string;
  // Terminal / platform tags, e.g. 小程序 / 小游戏 / Web / H5 / 多端应用
  terminalTags?: string[];
  // Application type tags, e.g. 游戏 / 工具/效率 / 教育/学习 / 社交/社区 / 电商/业务系统 / 多媒体/音视频
  appTypeTags?: string[];
  // Development tool tags, e.g. CodeBuddy / Cursor / Claude Code / CloudBase AI CLI
  devToolTags?: string[];
  // Tech stack tags, e.g. Vue / React / 小程序原生 / 云函数 / 云托管
  techStackTags?: string[];
}

const TERMINAL_ORDER = ['小程序', 'Web', '小游戏', '原生应用'];

const tutorials: Tutorial[] = [
  // 文章
  {
    id: 'article-qiyi-ai-app-community',
    title: '不会代码，她靠AI开发了APP，要把10万用户的社区运营起来',
    description: '云开发团队',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/DXQGXX81Q4W8-ZwL3PxAAQ',
    type: 'article',
    terminalTags: ['小程序', '原生应用'],
    appTypeTags: ['社交/社区'],
  },
  {
    id: 'article-openclaw-cloudbase-auto-deploy',
    title: '一个人就是一支团队：OpenClaw+CloudBase实现全自动开发上线',
    description: '腾讯云开发CloudBase',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/vKcnro2GrbjI_QyQohpNRw',
    type: 'article',
    appTypeTags: ['工具/效率'],
    devToolTags: ['OpenClaw'],
  },
  {
    id: 'article-agent-skills-last-mile',
    title: 'Agent Skills实战分享：AI编程最后一公里，别让代码死在localhost里',
    description: '腾讯云开发CloudBase',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/soIEU5DG01xfrKMaCetGAA',
    type: 'article',
    appTypeTags: ['工具/效率'],
  },
  {
    id: 'article-wechat-miniprogram-ai-growth-plan-tutorial',
    title: '微信小程序AI成长计划：免费云开发资源与混元Token，手把手教你开发一个 AI 小程序',
    description: '鹅厂技术派',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/eB0x7Jc1lKP13dBMY9wsgw',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
  },
  {
    id: 'article-codebuddy-cloudbase-health-checkin-web-app',
    title: '0 基础也能学会！用 CodeBuddy + CloudBase 开发健康打卡 Web 应用（完整教程）',
    description: '腾讯云代码助手CodeBuddy',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/vlav-rPTqO1jB5AYpcOS_A',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'article-yuandan-xinnian-xingyunqian',
    title: '元旦快乐！手把手教你0代码手搓新年幸运签（附保姆级教程）',
    description: '鹅厂技术派',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/5-RS9ncn2diRf0e7i_3oqw',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'article-mastermind-ai',
    title: '人人都有董事会：AI + CloudBase 激活超级个体商业思维（开发实录）',
    description: '洞穴之外 1.0',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/SodwiGm1CD4-HGfylGw8rA',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['Cursor'],
  },
  {
    id: 'article-ai-assistant-iq-double',
    title: '只需一个动作,让你的 AI 编程助手智商翻倍(附 CloudBase 开发秘籍)',
    description: '洞穴之外 1.0',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/e9kWOdq7SaqCJRTTK5yTBQ',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['Cursor'],
  },
  {
    id: 'article-cursor-cloudbase-fragment-assistant',
    title: 'Cursor + CloudBase，两周闲暇时间做出我的"AI 碎片助理"',
    description: '飞哥数智谈',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/sxpxcSO7rwNFCGc0ZzcC8Q',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['Cursor'],
  },
  {
    id: 'meeting-room-system',
    title: '低代码？不！是高效代码：CodeBuddy IDE + CloudBase 开发会议室系统实战',
    description: '六月的雨在Tencent',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2593378',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率', '电商/业务系统'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'ai-game-paradigm',
    title: 'CloudBase + AI 游戏开发新范式，3小时极速开发',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2575573',
    type: 'article',
    terminalTags: ['Web', '小游戏'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'anime-tracker',
    title: '追番新姿势： 美少女程序员用CloudBase+CodeBuddy 8分钟手搓追番神器！！！',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2574377',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率', '多媒体/音视频'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'zero-code-miniprogram',
    title: '从没写过代码的小白，也能用 CodeBuddy + CloudBase 打造商业小程序！',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2571757',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['电商/业务系统'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'claude-code-figma',
    title: '手把手教你用 Claude Code + CloudBase + Figma 完成商业小程序全栈开发',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2547137',
    type: 'article',
    terminalTags: ['小程序', 'Web'],
    appTypeTags: ['电商/业务系统'],
    devToolTags: ['Claude Code'],
  },
  {
    id: 'anonymous-social-app',
    title: '手把手带你用AI 2天撸出6端匿名社交App！',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2549936',
    type: 'article',
  },
  {
    id: 'finance-assistant',
    title: '腾讯云CodeBuddy AI IDE+CloudBase AI ToolKit打造理财小助手网页',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2551403',
    type: 'article',
  },
  {
    id: 'animal-match-game',
    title: '基于CloudBase AI Toolkit十首歌的时间开发《动物连连看》微信小游戏',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2544009',
    type: 'article',
  },
  {
    id: 'gomoku-online',
    title: 'CodeBuddy IDE + 云开发CloudBase 实现五子棋在线小游戏',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2547526',
    type: 'article',
  },
  {
    id: 'sleep-assistant',
    title: '基于CloudBase AI Toolkit + Vue Web轻松构建智能睡眠助手网站',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2538039',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率', '多媒体/音视频'],
    devToolTags: ['CodeBuddy'],
    techStackTags: ['Vue'],
  },
  {
    id: 'english-learning-h5',
    title: 'CloudBase AI ToolKit编程实战，无痛开发刷视频学英语h5应用',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2538050',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['教育/学习', '多媒体/音视频'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'fps-game',
    title: 'AI编程实战：云开发疯狂助攻，React + Vite 做出 FPS 网页游戏不是梦',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2537874',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
    techStackTags: ['React', 'Vite'],
  },
  {
    id: 'h5-shooting-game',
    title: '从Prompt到上线：CloudBase AI Toolkit 3步打造H5射击小游戏新体验',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2536222',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'art-gallery-h5',
    title: '极速开发实践！AI助你打造专属时空艺术馆H5，小白也能变策展人！',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2535206',
    type: 'article',
  },
  {
    id: 'calendar-memo',
    title: 'CloudBase AI Toolkit给我做了一个H5日历备忘录，终于不靠记性生活了',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2536280',
    type: 'article',
  },
  {
    id: 'ai-cli-miniprogram',
    title: '用 CloudBase AI CLI 开发邻里闲置物品循环利用小程序',
    description: 'CloudBase',
    category: '文章',
    url: 'https://docs.cloudbase.net/practices/ai-cli-mini-program',
    type: 'article',
  },
  {
    id: 'codebuddy-card-game',
    title: '使用 CodeBuddy IDE + CloudBase 一站式开发卡片翻翻翻游戏',
    description: '全栈若城',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/2EM3RBzdQUCdfld2CglWgg',
    type: 'article',
  },
  {
    id: 'breakfast-shop',
    title: '1小时开发微信小游戏《我的早餐店》',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2532595',
    type: 'article',
    terminalTags: ['小游戏'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'cursor-game',
    title: 'AI Coding宝藏组合：Cursor + Cloudbase-AI-Toolkit 开发游戏实战',
    description: 'Cheishire_Cat',
    category: '文章',
    url: 'https://juejin.cn/post/7518783423277695028#comment',
    type: 'article',
  },
  {
    id: 'overcooked-game',
    title: '2天上线一款可联机的分手厨房小游戏',
    description: 'Cheishire_Cat',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/nKfhHUf8w-EVKvA0u1rdeg',
    type: 'article',
  },
  {
    id: 'cloud-deploy',
    title: '没有服务器，怎么云化部署前后端项目',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2537971',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'business-card',
    title: '快速打造程序员专属名片网站',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2536273',
    type: 'article',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'hot-words-miniprogram',
    title: '我用「CloudBase AI ToolKit」一天做出"网络热词"小程序',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2537907',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'cloud-library',
    title: '用AI打造你的专属"云书房"小程序！',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2535789',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['教育/学习'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'resume-miniprogram',
    title: '一人挑战全栈研发简历制作小程序',
    description: 'CloudBase',
    category: '文章',
    url: 'https://cloud.tencent.com/developer/article/2535894',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'worry-box',
    title: '我用AI开发并上线了一款小程序：解忧百宝盒',
    description: 'TechInfQ',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/DYekRheNQ2u8LAl_F830fA',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'figma-cursor-cloudbase',
    title: 'AI时代，从零基础到全栈开发者之路',
    description: '洞穴之外 1.0',
    category: '文章',
    url: 'https://mp.weixin.qq.com/s/nT2JsKnwBiup1imniCr2jA',
    type: 'article',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['Cursor', 'Figma'],
  },
  // 视频
  {
    id: 'video-figma-codebuddy-miniprogram',
    title: 'Figma + CodeBuddy + CloudBase 实战：完整开发一个微信小程序',
    description: 'JavaPub',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1bRBkBFE7x/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1bRBkBFE7x.jpg',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy', 'Figma'],
  },
  {
    id: 'video-ai-topic-miner',
    title: '我做了一个"AI 热门视频选题挖掘机"丨全网热点一键掌控！CodeBuddy AI 编程项目实战',
    description: '吕立青_JimmyLv',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1nsB7BCEgD/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1nsB7BCEgD.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-cloudbase-backend',
    title: 'cloudbase软件分享：一键写后端',
    description: 'AI创业进行时',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV11DB4B2Eie/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV11DB4B2Eie.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
  },
  {
    id: 'video-bilibili-ai-assistant',
    title: '【教程】不写一行代码，开发B站热门选题AI助手 | 数据分析  | 爬虫',
    description: '熠辉IndieDev',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1JBmKBBEZa/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1JBmKBBEZa.jpg',
  },
  {
    id: 'video-mbti-dating',
    title: '我用AI做了个MBTI交友网站：从写代码到部署上线，AI+MCP 全部自己搞定！简直离谱！',
    description: '御风大世界',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1QG3EzjEFZ/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1QG3EzjEFZ.jpg',
  },
  {
    id: 'video-ai-try-on',
    title: 'AI编程：从0到1开发一个AI试衣小程序！免费分享 | 含源码',
    description: '熠辉IndieDev',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1NEsWzRE6U/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1NEsWzRE6U.jpg',
  },
  {
    id: 'video-cursor-cloudbase',
    title: 'Cursor教学视频08：Cursor+Cloudbase MCP，10分钟完成带后端的全栈应用开发',
    description: 'AI进化论-花生',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1TXuVzoE9p/?vd_source=c8763f6ab9c7c6f7f760ad7ea9157011',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1TXuVzoE9p.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['Cursor'],
  },
  {
    id: 'video-english-learning',
    title: '【新手向】 从 0 到 1构建一个可视化的 AI 英语学习应用',
    description: '吕立青_JimmyLv',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1SK2xBTE2M/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1SK2xBTE2M.jpg',
  },
  {
    id: 'video-ecommerce',
    title: '单挑整个电商项目？AI 能代替程序员了吗',
    description: '吴悠讲编程',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1QzSYBBEBe/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1QzSYBBEBe.jpg',
  },
  {
    id: 'video-miniprogram-basics',
    title: '零基础入门AI小程序开发教程',
    description: '野码AI',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV123SyB4Ekt/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV123SyB4Ekt.jpg',
    terminalTags: ['小程序'],
    appTypeTags: ['教育/学习'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-software30',
    title: '软件3.0：AI 编程新时代的最佳拍档 CloudBase AI ToolKit，以开发微信小程序为例',
    description: '吕立青_JimmyLv',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV15gKdz1E5N/?share_source=copy_web',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV15gKdz1E5N.jpg',
    terminalTags: ['小程序'],
    appTypeTags: ['教育/学习'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-overcooked',
    title: '云开发CloudBase：用AI开发一款分手厨房小游戏',
    description: '腾讯云云开发',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1v5KAzwEf9/',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1v5KAzwEf9.jpg',
    terminalTags: ['Web', '小游戏'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-resume',
    title: '用AiCoding 一人挑战全栈研发简历制作小程序',
    description: '全栈若城',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1D23Nz1Ec3/',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1D23Nz1Ec3.jpg',
  },
  {
    id: 'video-business-card',
    title: '5分钟在本地创造一个程序员专属名片网站',
    description: 'LucianaiB',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV19y3EzsEHQ/?vd_source=c8763f6ab9c7c6f7f760ad7ea9157011',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV19y3EzsEHQ.jpg',
  },
  {
    id: 'video-codebuddy-miniprogram',
    title: '实战教程：通过codeBuddy +cloudBase 开发上线一款微信小程序！你也可以！',
    description: '空菜',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1NEbjzjEeZ/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1NEbjzjEeZ.jpg',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-codebuddy-backend',
    title: 'CodeBuddyIDE 搭配 CloudBase完成小程序后台管理系统快速搭建',
    description: '全栈若城',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV13C8nzzEoq/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV13C8nzzEoq.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['电商/业务系统'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-cloudbase-deploy',
    title: '女大学生教你不买服务器，一秒把网站弄上线！0-1开发｜小白教程｜腾讯云CloudBase',
    description: '冰激凌奶茶雪糕子',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1LQpBzrEb2/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1LQpBzrEb2.jpg',
  },
  {
    id: 'video-xiaohe-architecture',
    title: '腾讯 CodeBuddy IDE × CloudBase 云开发实战：从零上线「小禾建筑AI智能平台」',
    description: 'AI创业进行时',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1DWbwz1EBU/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1DWbwz1EBU.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['电商/业务系统'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-cursor-miniprogram',
    title: '【小白教程】手把手教你用Cursor+微信云开发做个小程序 | 小白 AI 编程 | 零基础',
    description: '熠辉IndieDev',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1jx5kziEqz/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1jx5kziEqz.jpg',
    terminalTags: ['小程序'],
    appTypeTags: ['教育/学习'],
    devToolTags: ['Cursor'],
  },
  {
    id: 'video-podcast-tool',
    title: '零基础用codebuddy+CloudBase AI做播客推荐工具，我悟了："不必要的功能不加"',
    description: '马腾漫步',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1fb8XzMEDk/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1fb8XzMEDk.jpg',
  },
  {
    id: 'video-breakfast-shop',
    title: '沉浸式体验，从零用AI开发微信小游戏《我的早餐店》：CloudBase AI Toolkit教程',
    description: 'Lion_Long',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV12J3XzzE67/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV12J3XzzE67.jpg',
    terminalTags: ['小游戏'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-jixian-huiche',
    title: '极限惠车 - 停车充电优惠平台-基于CodeBuddy+云开发 + CloudBase AI ToolKit 构建的项目',
    description: 'vellzhao',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1TCYyzBEAC/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1TCYyzBEAC.jpg',
  },
  {
    id: 'video-boss-miniprogram',
    title: '老板让我1小时建好公司小程序…',
    description: '三太子敖丙',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1hX3DzuExZ/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1hX3DzuExZ.jpg',
  },
  {
    id: 'video-codebuddy-game',
    title: '用 CodeBuddy+CloudBase，轻松开发个性化游戏',
    description: '全栈若城',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1hpbsz1E7m/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1hpbsz1E7m.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-codebuddy-zero-coding',
    title: '使用CodeBuddy从0-1零编程打造一款微信小程序（附体验二维码）',
    description: '蓝镜空间',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1mNY2z3ESU/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1mNY2z3ESU.jpg',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'video-hospital-scheduling-saas',
    title: 'AI做的医院实习生排班SAAS系统',
    description: '采云小程序',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1SYYkziEy9/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1SYYkziEy9.jpg',
  },
  {
    id: 'video-big-eye-notes',
    title: 'Codebuddy*Cloudbase AI大眼萌笔记工具及开发过程介绍',
    description: 'AI大眼萌',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1B6b8zBEWT/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1B6b8zBEWT.jpg',
  },
  {
    id: 'video-cursor-gomoku',
    title: '【直播回放】Cursor+云开发，开发双人五子棋对战小游戏',
    description: '腾讯云云开发',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1uE3uzHEou/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1uE3uzHEou.jpg',
    terminalTags: ['Web'],
    appTypeTags: ['游戏'],
    devToolTags: ['Cursor'],
  },
  {
    id: 'video-one-person-company',
    title: '一人公司不是梦！1小时开发全栈应用【含完整前后端】',
    description: 'AI进化论-花生',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1Rp37zDESt/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1Rp37zDESt.jpg',
  },
  {
    id: 'video-wechat-sport',
    title: '云开发Cloudbase AI Toolkit + Cursor开发演示：用AI开发一个支持微信运动的小程序',
    description: '腾讯云云开发',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1hpjvzGESg/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1hpjvzGESg.jpg',
  },
  {
    id: 'video-finance-assistant',
    title: '腾讯云CodeBuddy IDE+CloudBase AI ToolKit打造理财小助手网页',
    description: 'irpickstars',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1o1bXzYEm9/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1o1bXzYEm9.jpg',
  },
  {
    id: 'video-codebuddy-international',
    title: 'CodeBuddy IDE国际版试用体验，让开发小程序的门槛再次降低！',
    description: '嘉锅实验室',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1YReMz7EKn/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1YReMz7EKn.jpg',
  },
  {
    id: 'video-ai-programming-deploy',
    title: 'AI编程，一键部署',
    description: '腾讯云云开发',
    category: '视频教程',
    url: 'https://www.bilibili.com/video/BV1Honwz1E64/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e',
    type: 'video',
    thumbnail: 'https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1Honwz1E64.jpg',
  },
  // 应用项目
  {
    id: 'project-resume',
    title: '简历助手小程序',
    description: 'GitCode 开源项目',
    category: '应用项目',
    url: 'https://gitcode.com/qq_33681891/resume_template',
    type: 'project',
    terminalTags: ['小程序'],
    appTypeTags: ['工具/效率'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'project-gomoku',
    title: '五子棋联机游戏',
    description: 'GitHub 开源项目',
    category: '应用项目',
    url: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/web/gomoku-game',
    type: 'project',
    terminalTags: ['Web'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'project-overcooked',
    title: '分手厨房联机游戏',
    description: 'GitHub 开源项目',
    category: '应用项目',
    url: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/web/overcooked-game',
    type: 'project',
    terminalTags: ['Web'],
    appTypeTags: ['游戏'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'project-ecommerce',
    title: '电商管理后台',
    description: 'GitHub 开源项目',
    category: '应用项目',
    url: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/web/ecommerce-management-backend',
    type: 'project',
    terminalTags: ['Web'],
    appTypeTags: ['电商/业务系统'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'project-video',
    title: '短视频小程序',
    description: 'GitHub 开源项目',
    category: '应用项目',
    url: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/miniprogram/cloudbase-ai-video',
    type: 'project',
    terminalTags: ['小程序'],
    appTypeTags: ['多媒体/音视频'],
    devToolTags: ['CodeBuddy'],
  },
  {
    id: 'project-dating',
    title: '约会小程序',
    description: 'GitHub 开源项目',
    category: '应用项目',
    url: 'https://github.com/TencentCloudBase/awesome-cloudbase-examples/tree/master/miniprogram/dating',
    type: 'project',
    terminalTags: ['小程序'],
    appTypeTags: ['社交/社区'],
    devToolTags: ['CodeBuddy'],
  },
];

const categoryLabels: Record<string, string> = {
  '文章': '文章',
  '视频教程': '视频教程',
  '应用项目': '应用项目',
};

export default function TutorialsGrid() {
  const [selectedTerminalTags, setSelectedTerminalTags] = useState<string[]>([]);
  const [selectedAppTypeTags, setSelectedAppTypeTags] = useState<string[]>([]);
  const [selectedDevToolTags, setSelectedDevToolTags] = useState<string[]>([]);

  const allTerminalTags = useMemo(() => {
    const tags = Array.from(
      new Set(
        tutorials
          .flatMap((t) => t.terminalTags || [])
          .filter(Boolean),
      ),
    );
    return tags.sort((a, b) => {
      const ia = TERMINAL_ORDER.indexOf(a);
      const ib = TERMINAL_ORDER.indexOf(b);
      const sa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
      const sb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
      return sa - sb || a.localeCompare(b);
    });
  }, []);

  const allAppTypeTags = useMemo(
    () =>
      Array.from(
        new Set(
          tutorials
            .flatMap((t) => t.appTypeTags || [])
            .filter(Boolean),
        ),
      ),
    [],
  );

  const allDevToolTags = useMemo(
    () =>
      Array.from(
        new Set(
          tutorials
            .flatMap((t) => t.devToolTags || [])
            .filter(Boolean),
        ),
      ),
    [],
  );

  const matchesTags = (tutorial: Tutorial) => {
    const hasIntersection = (source: string[] | undefined, selected: string[]) => {
      if (!selected.length) return true;
      if (!source || !source.length) return false;
      return selected.some((tag) => source.includes(tag));
    };

    return (
      hasIntersection(tutorial.terminalTags, selectedTerminalTags) &&
      hasIntersection(tutorial.appTypeTags, selectedAppTypeTags) &&
      hasIntersection(tutorial.devToolTags, selectedDevToolTags)
    );
  };

  const filteredTutorials = useMemo(
    () => tutorials.filter((t) => matchesTags(t)),
    [selectedTerminalTags, selectedAppTypeTags, selectedDevToolTags],
  );

  const groupedTutorials = useMemo(
    () =>
      filteredTutorials.reduce((acc, tutorial) => {
        if (!acc[tutorial.category]) {
          acc[tutorial.category] = [];
        }
        acc[tutorial.category].push(tutorial);
        return acc;
      }, {} as Record<string, Tutorial[]>),
    [filteredTutorials],
  );

  const toggleTag = (
    type: 'terminal' | 'appType' | 'devTool',
    tag: string,
  ) => {
    const toggle = (current: string[]) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag];

    if (type === 'terminal') {
      setSelectedTerminalTags((prev) => toggle(prev));
    } else if (type === 'appType') {
      setSelectedAppTypeTags((prev) => toggle(prev));
    } else {
      setSelectedDevToolTags((prev) => toggle(prev));
    }
  };

  const clearAllFilters = () => {
    setSelectedTerminalTags([]);
    setSelectedAppTypeTags([]);
    setSelectedDevToolTags([]);
  };

  // Separate videos with thumbnails from others
  const videoCategory = groupedTutorials['视频教程'] || [];
  const videosWithThumbnails = videoCategory.filter(v => v.thumbnail);
  const videosWithoutThumbnails = videoCategory.filter(v => !v.thumbnail);
  const otherCategories = Object.entries(groupedTutorials).filter(
    ([cat]) => cat !== '视频教程',
  ) as [string, Tutorial[]][];

  const hasActiveFilter =
    selectedTerminalTags.length > 0 ||
    selectedAppTypeTags.length > 0 ||
    selectedDevToolTags.length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <div className={styles.filterHeader}>
          <span className={styles.filterTitle}>按标签筛选</span>
          {hasActiveFilter && (
            <button
              type="button"
              className={styles.filterReset}
              onClick={clearAllFilters}
            >
              清除筛选
            </button>
          )}
        </div>

        {allTerminalTags.length > 0 && (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>终端</span>
            <div className={styles.filterTags}>
              {allTerminalTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.filterTag} ${
                    selectedTerminalTags.includes(tag)
                      ? styles.filterTagActive
                      : ''
                  }`.trim()}
                  onClick={() => toggleTag('terminal', tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {allAppTypeTags.length > 0 && (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>应用类型</span>
            <div className={styles.filterTags}>
              {allAppTypeTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.filterTag} ${
                    selectedAppTypeTags.includes(tag)
                      ? styles.filterTagActive
                      : ''
                  }`.trim()}
                  onClick={() => toggleTag('appType', tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {allDevToolTags.length > 0 && (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>开发工具</span>
            <div className={styles.filterTags}>
              {allDevToolTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.filterTag} ${
                    selectedDevToolTags.includes(tag)
                      ? styles.filterTagActive
                      : ''
                  }`.trim()}
                  onClick={() => toggleTag('devTool', tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Videos with thumbnails - displayed first */}
      {videosWithThumbnails.length > 0 && (
        <div className={styles.category}>
          <h3 className={styles.categoryTitle}>{categoryLabels['视频教程'] || '视频教程'}</h3>
          <div className={styles.videoGrid}>
            {videosWithThumbnails.map((tutorial) => (
              <Link
                key={tutorial.id}
                to={tutorial.url}
                className={styles.videoCard}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <div className={styles.thumbnailWrapper}>
                  <img 
                    src={tutorial.thumbnail} 
                    alt={tutorial.title}
                    className={styles.thumbnail}
                    loading="lazy"
                  />
                  <div className={styles.playIcon}>▶</div>
                </div>
                <div className={styles.videoContent}>
                  <div className={styles.videoTitle}>{tutorial.title}</div>
                  <div className={styles.videoDescription}>{tutorial.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Videos without thumbnails */}
      {videosWithoutThumbnails.length > 0 && (
        <div className={styles.category}>
          {videosWithThumbnails.length === 0 && (
            <h3 className={styles.categoryTitle}>{categoryLabels['视频教程'] || '视频教程'}</h3>
          )}
          <div className={styles.grid}>
            {videosWithoutThumbnails.map((tutorial) => (
              <Link
                key={tutorial.id}
                to={tutorial.url}
                className={styles.videoListItem}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <div className={styles.videoListTitle}>{tutorial.title}</div>
                <div className={styles.videoListDescription}>{tutorial.description}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Other categories */}
      {otherCategories.map(([category, items]) => (
        <div key={category} className={styles.category}>
          <h3 className={styles.categoryTitle}>{categoryLabels[category] || category}</h3>
          {category === '文章' ? (
            <div className={styles.articleList}>
              {items.map((tutorial, index) => (
                <div key={tutorial.id} className={styles.articleItem}>
                  <Link
                    to={tutorial.url}
                    className={styles.articleLink}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    <div className={styles.articleTitle}>{tutorial.title}</div>
                    <div className={styles.articleDescription}>{tutorial.description}</div>
                  </Link>
                  {index < items.length - 1 && (
                    <div className={styles.articleDivider} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.projectList}>
              {items.map((tutorial) => (
                <Link
                  key={tutorial.id}
                  to={tutorial.url}
                  className={styles.projectCard}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  <div className={styles.projectHeader}>
                    <div className={styles.projectName}>{tutorial.title}</div>
                  </div>
                  <div className={styles.projectDescription}>{tutorial.description}</div>
                  <div className={styles.projectMeta}>
                    {tutorial.terminalTags && tutorial.terminalTags.length > 0 && (
                      <span className={styles.projectMetaItem}>
                        {tutorial.terminalTags.join(' / ')}
                      </span>
                    )}
                    {tutorial.appTypeTags && tutorial.appTypeTags.length > 0 && (
                      <span className={styles.projectMetaItem}>
                        {tutorial.appTypeTags.join(' / ')}
                      </span>
                    )}
                    {tutorial.devToolTags && tutorial.devToolTags.length > 0 && (
                      <span className={styles.projectMetaItem}>
                        {tutorial.devToolTags.join(' / ')}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
