# Add Article Tutorial

## Function
Add a new article tutorial (from Juejin or other platforms) to the TutorialsGrid component, including metadata extraction from article pages.

## Trigger Condition
When user inputs `/add_article_tutorial` or provides an article URL with request to add it as a tutorial

**Default Behavior**: If no article URL is provided, automatically open Juejin search page to browse for new CloudBase articles

## Workflow

### 0. Check for New Articles (Default Action)
- **Default Behavior**: When command is triggered without a specific article URL, automatically open Juejin search page to check for new CloudBase-related articles
- **Search URL**: `https://juejin.cn/search?query=cloudbase&fromSeo=0&fromHistory=0&fromSuggest=0&enterFrom=home_page&sort=1`
- **Purpose**: Browse CloudBase articles from Juejin (掘金)
- **Tool**: Use `mcp_cursor-ide-browser_browser_navigate` to open the search page
- **Content Filtering Requirements**:
  - **MUST be related to**: CloudBase MCP, AI Coding, AI 编程, CloudBase AI Toolkit, MCP 工具, AI 开发工具等
  - **MUST NOT include**: 
    - 低代码 (low-code), 无代码 (no-code), 微搭, 可视化搭建等低代码平台相关内容
    - 活动、福利、奖品、周边、抽奖、参与有礼、晒出、领取等营销活动相关内容
  - **Preferred topics**: 
    - CloudBase MCP 使用案例
    - AI Coding 开发实践
    - Cursor/CodeBuddy/WindSurf 等 AI IDE 与 CloudBase 集成
    - CloudBase AI Toolkit 使用教程
    - MCP 工具开发和应用
    - AI 原生开发实践
  - **Filtering method**: 
    - Check article title and description for relevance
    - Skip articles that mention "低代码", "无代码", "微搭", "可视化" prominently
    - Skip articles that mention "福利", "活动", "奖品", "周边", "抽奖", "参与有礼", "晒出", "领取" in title (these are marketing/promotional activities)
    - Focus on articles that mention "AI", "MCP", "CloudBase MCP", "AI Coding", "AI 编程" in title or description
- **Note**: 
  - Search results support sorting by time (sort=1 means sorted by time, newest first)
  - Calculate cutoff date: one month ago from current date (e.g., if today is 2025-12-29, look for articles after 2025-11-29)
  - Search results show dates in various formats: "3小时前" (3 hours ago), "2025-12-22", etc.
  - Juejin article URLs format: `https://juejin.cn/post/{article-id}`
  - Article links in search results should be extractable from the page
- **After browsing**: 
  - Identify articles published within the last month
  - **Filter out low-code related articles** (低代码, 无代码, 微搭, 可视化搭建等)
  - **Filter out activity/promotional articles** (福利, 活动, 奖品, 周边, 抽奖, 参与有礼, 晒出, 领取等)
  - **Prioritize articles related to CloudBase MCP and AI Coding**
  - Extract article links from filtered results
  - If links can be extracted, proceed to extract article information
  - If links cannot be extracted, list identified articles and ask user to provide URLs
  - User can provide specific article URLs to add, or command can proceed to extract information if URL is already provided

### 1. Extract Article Information
- Parse article URL (Juejin: `juejin.cn/post/...`, WeChat: `mp.weixin.qq.com/s/...`, or other platforms)
- Navigate to article page using browser
- Extract article metadata from page:
  - Article title
  - Author name (作者名称)
  - Publication date (for sorting)
  - Article URL
  - Article description/summary (optional, can use first paragraph or title)

**Key Information to Extract (Juejin)**:
- **Title**: Usually in `<h1>` tag with class containing "title" or in article header
- **Author**: Usually in author info section, look for author name link or profile
- **Date**: Usually in time element, format: `YYYY-MM-DD` or relative time like "3小时前"
- **URL**: Use the canonical URL from the article page (format: `https://juejin.cn/post/{id}`)

**Key Information to Extract (WeChat - for existing articles)**:
- **Title**: Usually in `<h1>` or `<h2>` tag with `id="activity-name"` or similar
- **Author**: Usually in `<a>` tag with class containing "profile" or "account", or in meta tags
- **Date**: Usually in `<em>` tag with `id="publish_time"` or similar, format: `YYYY-MM-DD` or `YYYY年MM月DD日`
- **URL**: Use the canonical URL from the article page

**Note**: Article pages may require JavaScript to fully load. Use browser tools to wait for page load and extract information.

### 2. Determine Tags
- **Terminal Tags** (终端/平台):
  - Common values: `['小程序']`, `['Web']`, `['小游戏']`, `['原生应用']`
  - Order: `['小程序', 'Web', '小游戏', '原生应用']` (TERMINAL_ORDER constant)
  - Determine from article title/content or ask user

- **App Type Tags** (应用类型):
  - Common values: `['游戏']`, `['工具/效率']`, `['教育/学习']`, `['社交/社区']`, `['电商/业务系统']`, `['多媒体/音视频']`
  - Determine from article title/content or ask user

- **Dev Tool Tags** (开发工具):
  - Common values: `['CodeBuddy']`, `['Cursor']`, `['Claude Code']`, `['Figma']`
  - **Important**: Do NOT include "CloudBase AI Toolkit" or "MCP" - CloudBase MCP is the default backend service for all tutorials and doesn't need to be explicitly tagged
  - Determine from article title/content or ask user

- **Tech Stack Tags** (技术栈) - Optional:
  - Common values: `['Vue']`, `['React']`, `['小程序原生']`, `['云函数']`, `['云托管']`
  - **Important**: Do NOT include "CloudBase AI Toolkit" or "MCP" in techStackTags - CloudBase MCP is the default backend service for all tutorials and doesn't need to be explicitly tagged
  - Determine from article title/content or ask user

### 3. Add to TutorialsGrid.tsx
- **Location**: `doc/components/TutorialsGrid.tsx`
- **Insert Position**: At the beginning of article tutorials array (after line ~26, before existing articles)
- **Format**:
  ```typescript
  {
    id: 'article-{kebab-case-title}',
    title: '{Article Title}',
    description: '{Article Description or Author Name}',
    category: '文章',
    url: '{Article URL}',
    type: 'article',
    terminalTags: ['{tag1}', '{tag2}'],
    appTypeTags: ['{tag1}'],
    devToolTags: ['{tag1}', '{tag2}'],
    techStackTags: ['{tag1}'], // Optional - Do NOT include "CloudBase AI Toolkit" or "MCP"
  },
  ```

**Note**: Articles do NOT have `thumbnail` field (unlike videos)

### 4. Sorting
- **Requirement**: Articles should be sorted in descending order by publication date (newest first)
- New articles should be inserted at the beginning of the article tutorials section
- **Important**: Juejin search results support sorting by time (sort=1), but still verify publication date from article page
- After adding, verify the chronological order

### 5. Quality Checklist
- [ ] Article URL is valid and accessible (Juejin, WeChat, or other platforms)
- [ ] **Article content is relevant to CloudBase MCP and AI Coding** (NOT low-code related)
- [ ] Article does NOT focus on low-code platforms (低代码, 无代码, 微搭, 可视化搭建)
- [ ] Article is NOT a marketing/promotional activity (福利, 活动, 奖品, 周边, 抽奖, 参与有礼, 晒出, 领取等)
- [ ] Article metadata (title, author, date) successfully extracted
- [ ] Publication date is verified (click into article if needed)
- [ ] Article entry added to TutorialsGrid.tsx with correct format
- [ ] All required tags are filled (terminalTags, appTypeTags, devToolTags)
- [ ] Article is placed at correct position (newest first)
- [ ] ID is unique and follows kebab-case format
- [ ] No duplicate entries exist
- [ ] No thumbnail field (articles don't have thumbnails)

## Example Usage

**Input**: 
```
/add_article_tutorial
https://juejin.cn/post/xxxxx
```

**Process**:
1. (If no URL provided) Open Juejin search page for CloudBase articles
2. Navigate to article page
3. Extract metadata: Title, Author, Publication Date, URL
4. Determine tags from title: `terminalTags: ['小程序']`, `appTypeTags: ['工具/效率']`, `devToolTags: ['CodeBuddy']` (Note: CloudBase MCP is default, don't include it)
5. Add entry at beginning of article tutorials array
6. Verify sorting (newest first)

## Important Notes

1. **Default Search Page**: When command is triggered without a specific URL, automatically open the Juejin search page for CloudBase articles to help discover new content.

2. **Content Filtering**: 
   - **MUST filter out low-code related articles**: Skip articles that focus on "低代码", "无代码", "微搭", "可视化搭建" platforms
   - **MUST filter out activity/promotional articles**: Skip articles that are marketing activities, such as "福利", "活动", "奖品", "周边", "抽奖", "参与有礼", "晒出", "领取" in title
   - **MUST prioritize AI Coding and MCP content**: Focus on articles about CloudBase MCP, AI Coding, AI 编程, AI IDE integration
   - **Relevance check**: Before adding an article, verify it's about AI Coding with CloudBase MCP, not low-code platform usage or promotional activities
   - If article is primarily about low-code platforms or is a marketing activity, skip it even if it mentions CloudBase

3. **Search Results Sorting**: Juejin search supports sorting by time (sort=1 means newest first). However, you should still:
   - Verify publication date by clicking into articles
   - Ensure articles are added in correct chronological order (newest first)
   - Filter articles by relevance to CloudBase MCP and AI Coding

3. **Tag Determination**: 
   - Try to infer tags from article title and content
   - If uncertain, ask user for confirmation
   - Ensure all three required tag types are filled
   - **Never include "CloudBase AI Toolkit" or "MCP" in devToolTags** - CloudBase MCP is the default backend service used by all tutorials
   - **Never include "CloudBase AI Toolkit" or "MCP" in techStackTags** - CloudBase MCP is the default backend service and doesn't need to be explicitly tagged

4. **ID Generation**: 
   - Use kebab-case format
   - Prefix with `article-`
   - Based on article title (simplified, no special characters)

5. **Description Field**: 
   - Can use article description/summary, author name, or a brief description
   - This appears as gray text below article title in the UI

6. **No Thumbnail**: 
   - Articles do NOT have thumbnail images
   - Do NOT add `thumbnail` field to article entries

7. **Date Verification**: 
   - Always verify publication date by clicking into the article
   - Use the date to determine insertion position (newest first)

8. **Multiple Articles**: 
   - If user provides multiple URLs, process them one by one
   - Ensure each is added in correct chronological order
   - Check dates carefully since search doesn't sort

## Error Handling

- **Invalid Article URL**: Prompt user to provide valid article URL (Juejin: `juejin.cn/post/...`, WeChat: `mp.weixin.qq.com/s/...`, or other platforms)
- **Page Load Failure**: Wait for page to fully load, retry navigation if needed
- **Metadata Extraction Failure**: Use browser tools to inspect page structure, try alternative selectors
- **Date Not Found**: Ask user for publication date or skip date-based sorting
- **Duplicate Entry**: Check existing entries by URL or title, skip if already exists
- **Link Extraction Failure from Search Results**: 
  - If unable to extract links directly from search results, identify articles by title, author, and publication date
  - Ask user to provide article URLs, or note that links need to be added manually
  - When user confirms articles are valid, proceed with adding them once URLs are provided

## Differences from Video Tutorial Command

1. **No Thumbnail**: Articles don't have cover images, so no download/upload step needed
2. **No API**: Articles don't have a public API, need to scrape from page
3. **Browser Required**: Must use browser tools to extract information (no API alternative)
4. **Platform Support**: Supports Juejin (primary), WeChat Official Accounts, and other article platforms

