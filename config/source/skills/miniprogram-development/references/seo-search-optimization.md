# Mini Program SEO & WeChat Search Optimization (小程序搜索优化)

This reference covers WeChat Mini Program **search optimization / SEO** (小程序搜索优化、页面收录、搜索曝光). Read it when the task involves:

- 小程序 SEO / 小程序搜索优化 / 搜索推广 / 关键词排名
- 页面被微信搜索收录（indexing / crawl）、爬虫（mpcrawler）访问、页面 URL 可直达
- `navigator` 跳转 vs 路由 API、页面参数设计、授权登录时机、`web-view` 收录限制
- 页面标题（`wx.setNavigationBarTitle`）、分享缩略图（`onShareAppMessage`）、`poster` / `poster-for-crawler` 设置

Official doc: <https://developers.weixin.qq.com/miniprogram/dev/framework/search/seo.html>

## 1. Crawler identification (官方搜索爬虫识别)

When the crawler visits pages inside a mini program it sends a dedicated **user-agent** `mpcrawler` and scene value **1129**.

To verify that a request really comes from the official WeChat search crawler (recommended before serving any content or recording crawler hits):

- Request headers include:
  - `X-WXApp-Crawler-Timestamp`
  - `X-WXApp-Crawler-Nonce`
  - `X-WXApp-Crawler-Signature`
- Signature algorithm is identical to the WeChat message-push signature algorithm:
  1. Sort the three params `token`, `X-WXApp-Crawler-Timestamp`, `X-WXApp-Crawler-Nonce` in lexicographic order
  2. Concatenate the three strings and `sha1` encrypt them
  3. Compare the result with `X-WXApp-Crawler-Signature` to confirm the request originates from WeChat

## 2. Page URLs must be directly openable (页面 URL 可被直接打开)

- Internal jump URLs are a key source the crawler uses to discover pages.
- Any result page that search engines return **must open directly**, independent of on-page state / previous steps.
- Put the params the page needs **in the URL** (query string), not in global storage or a shared data object.

## 3. Prefer the `navigator` component (页面跳转优先 navigator)

Mini programs provide two routing paths:

- `navigator` **component** (preferred for crawler-friendly pages)
- Routing API: `navigateTo` / `redirectTo` / `switchTab` / `navigateBack` / `reLaunch`

Use the `navigator` component whenever possible. If an API call is unavoidable, guard any click-triggered time locks or variable locks so crawler visits are not blocked.

## 4. Clear, simple page params (清晰简洁的页面参数)

- Query strings should be structured, concise, and with meaningful parameter names.
- **Avoid** serializing whole JSON objects into a single URL param — it hurts crawling and later analysis.

## 5. Ask for auth / login / phone binding only when necessary (必要的时候才请求授权登录)

- Only require authorization when it is truly needed (e.g. reading an article anonymously is fine; commenting requires identity).
- Do not gate content pages behind login; that blocks crawlers from indexing them.

## 6. `web-view` content is not indexed (不收录 web-view)

- WeChat does **not** index any content rendered inside `web-view`. Do not rely on `web-view` pages for search traffic; provide native mini program pages for indexable content.

## 7. Set a clear title and page thumbnail (清晰的标题和页面缩略图)

Title and thumbnail help WeChat understand the page and boost exposure/conversion:

- `wx.setNavigationBarTitle` — set the page title at runtime
- `onShareAppMessage` — customize the shared title and image path
- For `video` / `audio` components, also set `poster` / `poster-for-crawler` so crawler snapshots have a cover image

## Checklist before shipping indexable pages

1. Every indexable page can be opened directly from a URL with all params in the query string.
2. Jumps use `navigator` (or API calls are crawler-safe).
3. Param names are meaningful; no giant JSON blobs in the query string.
4. Content is readable without login/authorization.
5. Indexable content lives in native pages, not `web-view`.
6. Titles (`wx.setNavigationBarTitle`) and thumbnails (`onShareAppMessage` / `poster` / `poster-for-crawler`) are set for key pages.
