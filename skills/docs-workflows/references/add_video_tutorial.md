# Add Video Tutorial

## Function
Add a new Bilibili video tutorial to the TutorialsGrid component, including automatic thumbnail download, cloud storage upload, and metadata extraction.

## Trigger Condition
When user inputs `/add_video_tutorial` or provides a Bilibili video URL with request to add it as a tutorial

**Default Behavior**: If no video URL is provided, automatically open Bilibili search page to browse for new CloudBase videos

## Workflow

### 0. Check for New Videos (Default Action)
- **Default Behavior**: When command is triggered without a specific video URL, automatically open Bilibili search page to check for new CloudBase-related videos
- **Search URL**: `https://search.bilibili.com/all?keyword=cloudbase&from_source=webtop_search&spm_id_from=333.1007&search_source=5&order=pubdate`
- **Purpose**: Browse latest CloudBase videos sorted by publication date (newest first)
- **Tool**: Use `mcp_cursor-ide-browser_browser_navigate` to open the search page
- **Note**: This helps discover new videos that haven't been added to the tutorial list yet
- **After browsing**: User can provide specific video URLs to add, or command can proceed to extract information if URL is already provided

### 1. Extract Video Information
- Parse Bilibili video URL to extract BV number (e.g., `BV1bRBkBFE7x` from URL)
- Use Bilibili API to fetch video metadata:
  - Video title
  - Author name (UP主昵称)
  - Thumbnail image URL
  - Publication date (for sorting)

**API Endpoint**: `https://api.bilibili.com/x/web-interface/view?bvid={BV号}`

**Key Fields**:
- `data.title` - Video title
- `data.owner.name` - Author name (used as description)
- `data.pic` - Thumbnail image URL

### 2. Download Thumbnail
- Create temporary directory: `/tmp/bilibili-thumbnails/`
- Download thumbnail image using curl:
  ```bash
  curl -L "{thumbnail_url}" -o "/tmp/bilibili-thumbnails/{BV号}.jpg"
  ```

### 3. Upload to Cloud Storage
- **Prerequisite**: Ensure logged into correct CloudBase environment
  - Check current environment using `envQuery` tool
  - If wrong environment, user should logout and login again
- Upload thumbnail to cloud storage:
  - **Cloud Path**: `video-thumbnails/{BV号}.jpg`
  - **Tool**: `mcp_cloudbase_manageStorage` with `action=upload`
  - **Local Path**: `/tmp/bilibili-thumbnails/{BV号}.jpg`
- Get permanent access URL from upload response
  - Format: `https://{env-id}-{app-id}.tcb.qcloud.la/video-thumbnails/{BV号}.jpg`

### 4. Determine Tags
- **Terminal Tags** (终端/平台):
  - Common values: `['小程序']`, `['Web']`, `['小游戏']`, `['原生应用']`
  - Order: `['小程序', 'Web', '小游戏', '原生应用']` (TERMINAL_ORDER constant)
  - Determine from video title/content or ask user

- **App Type Tags** (应用类型):
  - Common values: `['游戏']`, `['工具/效率']`, `['教育/学习']`, `['社交/社区']`, `['电商/业务系统']`, `['多媒体/音视频']`
  - Determine from video title/content or ask user

- **Dev Tool Tags** (开发工具):
  - Common values: `['CodeBuddy']`, `['Cursor']`, `['Claude Code']`, `['Figma']`
  - **Important**: Do NOT include "CloudBase AI Toolkit" or "MCP" - CloudBase MCP is the default backend service for all tutorials and doesn't need to be explicitly tagged
  - Determine from video title/content or ask user

- **Tech Stack Tags** (技术栈) - Optional:
  - Common values: `['Vue']`, `['React']`, `['小程序原生']`, `['云函数']`, `['云托管']`
  - **Important**: Do NOT include "CloudBase AI Toolkit" or "MCP" in techStackTags - CloudBase MCP is the default backend service for all tutorials and doesn't need to be explicitly tagged
  - Determine from video title/content or ask user

### 5. Add to TutorialsGrid.tsx
- **Location**: `doc/components/TutorialsGrid.tsx`
- **Insert Position**: At the beginning of video tutorials array (after line ~300, before existing videos)
- **Format**:
  ```typescript
  {
    id: 'video-{kebab-case-title}',
    title: '{Video Title from Bilibili}',
    description: '{Author Name from Bilibili API}',
    category: '视频教程',
    url: '{Bilibili Video URL}',
    type: 'video',
    thumbnail: '{Cloud Storage URL}',
    terminalTags: ['{tag1}', '{tag2}'],
    appTypeTags: ['{tag1}'],
    devToolTags: ['{tag1}', '{tag2}'],
    techStackTags: ['{tag1}'], // Optional - Do NOT include "CloudBase AI Toolkit" or "MCP"
  },
  ```

### 6. Sorting
- **Requirement**: Videos must be sorted in descending order by publication date (newest first)
- New videos should be inserted at the beginning of the video tutorials section
- After adding, verify the chronological order

### 7. Quality Checklist
- [ ] Bilibili video URL is valid and accessible
- [ ] Video metadata (title, author) successfully extracted
- [ ] Thumbnail image downloaded successfully
- [ ] CloudBase environment is correct (check envQuery before upload)
- [ ] Thumbnail uploaded to cloud storage successfully
- [ ] Cloud storage URL is permanent (not temporary)
- [ ] Video entry added to TutorialsGrid.tsx with correct format
- [ ] All required tags are filled (terminalTags, appTypeTags, devToolTags)
- [ ] Video is placed at correct position (newest first)
- [ ] ID is unique and follows kebab-case format
- [ ] No duplicate entries exist

## Example Usage

**Input**: 
```
/add_video_tutorial
https://www.bilibili.com/video/BV1bRBkBFE7x/?share_source=copy_web&vd_source=068decbd00a3d00ff8662b6a358e5e1e
```

**Process**:
1. (If no URL provided) Open Bilibili search page: `https://search.bilibili.com/all?keyword=cloudbase&from_source=webtop_search&spm_id_from=333.1007&search_source=5&order=pubdate`
2. Extract BV: `BV1bRBkBFE7x`
3. Fetch metadata: Title, Author (JavaPub), Thumbnail URL
4. Download thumbnail to `/tmp/bilibili-thumbnails/BV1bRBkBFE7x.jpg`
5. Upload to `video-thumbnails/BV1bRBkBFE7x.jpg`
6. Determine tags from title: `terminalTags: ['小程序']`, `appTypeTags: ['工具/效率']`, `devToolTags: ['CodeBuddy', 'Figma']` (Note: CloudBase MCP is default, don't include it)
7. Add entry at beginning of video tutorials array
8. Verify sorting (newest first)

## Important Notes

1. **Default Search Page**: When command is triggered without a specific URL, automatically open the Bilibili search page for CloudBase videos (sorted by publication date) to help discover new content.

2. **Environment Check**: Always verify CloudBase environment before uploading. Wrong environment will result in incorrect URLs.

2. **Tag Determination**: 
   - Try to infer tags from video title and description
   - If uncertain, ask user for confirmation
   - Ensure all three required tag types are filled
   - **Never include "CloudBase AI Toolkit" or "MCP" in devToolTags** - CloudBase MCP is the default backend service used by all tutorials
   - **Never include "CloudBase AI Toolkit" or "MCP" in techStackTags** - CloudBase MCP is the default backend service and doesn't need to be explicitly tagged

3. **Thumbnail URL Format**: 
   - Use permanent cloud storage URL, not temporary URL
   - Format: `https://{env-id}-{app-id}.tcb.qcloud.la/video-thumbnails/{BV号}.jpg`

4. **ID Generation**: 
   - Use kebab-case format
   - Prefix with `video-`
   - Based on video title (simplified, no special characters)

5. **Description Field**: 
   - Always use author name (UP主昵称) from Bilibili API
   - This appears as gray text below video title in the UI

6. **Multiple Videos**: 
   - If user provides multiple URLs, process them one by one
   - Ensure each is added in correct chronological order

## Error Handling

- **Invalid Bilibili URL**: Prompt user to provide valid Bilibili video URL
- **API Failure**: Retry API call or use browser to extract information
- **Download Failure**: Check network connection, retry download
- **Upload Failure**: Verify CloudBase login status, check environment ID
- **Duplicate Entry**: Check existing entries by BV number, skip if already exists

