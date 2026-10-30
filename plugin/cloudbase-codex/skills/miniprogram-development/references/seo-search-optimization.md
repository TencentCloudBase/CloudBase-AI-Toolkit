# 小程序 SEO 与微信搜索优化（小程序搜索优化）

本参考覆盖微信小程序的 **搜索优化 / SEO**（小程序搜索优化、页面收录、搜索曝光）。任务涉及以下内容时阅读：

- 小程序 SEO / 小程序搜索优化 / 搜索推广 / 关键词排名
- 页面被微信搜索收录（indexing / crawl）、爬虫（mpcrawler）访问、页面 URL 可直达
- `navigator` 跳转 vs 路由 API、页面参数设计、授权登录时机、`web-view` 收录限制
- 页面标题（`wx.setNavigationBarTitle`）、分享缩略图（`onShareAppMessage`）、`poster` / `poster-for-crawler` 设置

官方文档：<https://developers.weixin.qq.com/miniprogram/dev/framework/search/seo.html>

## 1. 爬虫识别（官方搜索爬虫识别）

爬虫访问小程序内页面时，会发送专用 **user-agent** `mpcrawler`，场景值 **1129**。

确认请求确实来自官方微信搜索爬虫时（建议在返回任何内容或记录爬虫命中前先校验）：

- 请求头包含：
  - `X-WXApp-Crawler-Timestamp`
  - `X-WXApp-Crawler-Nonce`
  - `X-WXApp-Crawler-Signature`
- 签名算法与微信消息推送签名算法相同：
  1. 将三个参数 `token`、`X-WXApp-Crawler-Timestamp`、`X-WXApp-Crawler-Nonce` 按字典序排序
  2. 将三个字符串拼接后做 `sha1` 加密
  3. 将结果与 `X-WXApp-Crawler-Signature` 比较，确认请求来自微信

## 2. 页面 URL 必须可直接打开（页面 URL 可被直接打开）

- 站内跳转 URL 是爬虫发现页面的重要来源。
- 搜索引擎返回的任意结果页 **必须能直接打开**，不依赖页内状态 / 前置步骤。
- 页面所需参数放在 **URL**（query string）中，不要放在全局存储或共享数据对象里。

## 3. 优先使用 `navigator` 组件（页面跳转优先 navigator）

小程序提供两条路由路径：

- `navigator` **组件**（对爬虫友好的页面优先）
- 路由 API：`navigateTo` / `redirectTo` / `switchTab` / `navigateBack` / `reLaunch`

尽可能使用 `navigator` 组件。若必须用 API，对点击触发的时间锁或变量锁做保护，避免拦截爬虫访问。

## 4. 清晰简洁的页面参数（清晰简洁的页面参数）

- Query 字符串应结构清晰、简洁，参数名有意义。
- **避免** 把整个 JSON 对象序列化进单个 URL 参数 —— 既不利于爬取，也不利于后续分析。

## 5. 必要的时候才请求授权登录（必要的时候才请求授权登录）

- 仅在真正需要时要求授权（例如匿名阅读文章可以；评论需要身份）。
- 不要用登录墙挡住内容页；那会阻止爬虫收录。

## 6. `web-view` 内容不被收录（不收录 web-view）

- 微信 **不会** 收录 `web-view` 内渲染的任何内容。不要依赖 `web-view` 页面获取搜索流量；可索引内容请提供原生小程序页面。

## 7. 设置清晰的标题与页面缩略图（清晰的标题和页面缩略图）

标题与缩略图帮助微信理解页面，提升曝光与转化：

- `wx.setNavigationBarTitle` — 运行时设置页面标题
- `onShareAppMessage` — 自定义分享标题与图片路径
- 对 `video` / `audio` 组件，同时设置 `poster` / `poster-for-crawler`，以便爬虫快照有封面图

## 可收录页面上线前检查清单

1. 每个可收录页面都能从带齐 query 参数的 URL 直接打开。
2. 跳转使用 `navigator`（或 API 调用对爬虫安全）。
3. 参数名有意义；query 中无巨型 JSON blob。
4. 无需登录/授权即可阅读内容。
5. 可索引内容在原生页面中，不在 `web-view`。
6. 关键页面已设置标题（`wx.setNavigationBarTitle`）与缩略图（`onShareAppMessage` / `poster` / `poster-for-crawler`）。
