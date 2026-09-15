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
- **After browsing**: User can provide specific video URLs to add. If no specific URL is given, run the **Relevance Filter** (Step 0.5) on the search results and present only the passing candidates for the user to pick — do NOT auto-add noisy videos.

### 0.5 Relevance Filter (Mandatory in Discovery Mode)

When discovering videos via search (no specific URL provided), the raw `cloudbase` search returns many **unrelated** videos — e.g. 易支付 / 微信支付对接, OpenStack, Kubernetes, Supabase, uniCloud, sealos — because Bilibili fuzzy-matches `cloud` / `云` / tags. Apply this filter before presenting or adding anything.

**Rule**: a result is a candidate if its `title` or `description` contains (case-insensitive):
- **any Strong keyword**, OR
- **any Weak keyword AND none of the Exclusion keywords**.

| Tier | Keyword | Notes |
| --- | --- | --- |
| Strong | `cloudbase` | product name (incl. `CloudBase`, `CLOUDBASE`) |
| Strong | `腾讯云开发` / `腾讯云云开发` | explicit Tencent CloudBase |
| Weak | `云开发` | 微信云开发 etc. — also claimed by non-CloudBase platforms (sealos, uniCloud), hence weak |
| Weak | `codebuddy` | CloudBase official IDE (incl. `CodeBuddy`, `CodeBuddy IDE`) |

**Exclusion keywords** (drop the result unless a Strong keyword is also present): `sealos`, `unicloud`, `supabase`, `易支付`, `微信支付`, `openstack`, `kubernetes`, `k8s`

- Results matching none of the above are **dropped silently** (keyword false-positives, not CloudBase videos).
- When the user provides a specific Bilibili URL directly, skip this filter and process that video as requested (intent is explicit).
- After filtering, de-duplicate against already-recorded BV numbers (see Error Handling → Duplicate Entry) before presenting.
- Present each candidate with its **full URL** `https://www.bilibili.com/video/{bvid}/` (not just the BV number) so the user can open it directly. Note: Bilibili search re-ranks between calls, so the discovered set may differ slightly each run — pick one snapshot as the source of truth when batch-adding.

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
  - Run `auth(action="status")` FIRST and look for an env candidate with alias `tcb-advanced` (EnvId `tcb-advanced-a656fc`) in `env_candidates`.
    The docs-site thumbnails live in that env, so an account that cannot see it **cannot upload** — `queryEnv(action="info", envId="tcb-advanced-a656fc")` returns `env not found in list`.
    Do this check **before** downloading the thumbnail, so the account gap is surfaced early.
  - If the env is missing: the logged-in Tencent Cloud account is the wrong one. Switching CloudBase connectors does not help (both point at the same account). Ask the user to confirm, then `auth(action="logout", confirm="yes")` → `auth(action="start_auth", authMode="device")` and have them approve the device code; re-check `auth(action="status")` until the candidate appears.
  - Confirm the target is right by matching `queryEnv(action="info")`'s `Storages[0].CdnDomain` against the `video-thumbnails/` prefix already used in `TutorialsGrid.tsx` — they must be identical.
- Upload thumbnail to cloud storage:
  - **Cloud Path**: `video-thumbnails/{BV号}.jpg`
  - **Tool**: `mcp_cloudbase_manageStorage` with `action=upload`
  - **Local Path**: `/tmp/bilibili-thumbnails/{BV号}.jpg`
- Get permanent access URL from upload response
  - Format: `https://{appId}-{envId}-{uin}.tcb.qcloud.la/video-thumbnails/{BV号}.jpg`
  - Example: `https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/video-thumbnails/BV1bRBkBFE7x.jpg`
  - `appId` and the numeric `uin` suffix are visible in the env's `CdnDomain` returned by `queryEnv`

### 4. Determine Tags
- **Terminal Tags** (终端/平台):
  - Common values: `['小程序']`, `['Web']`, `['小游戏']`, `['原生应用']`
  - Order: `['小程序', 'Web', '小游戏', '原生应用']` (TERMINAL_ORDER constant)
  - Determine from video title/content or ask user

- **App Type Tags** (应用类型):
  - Common values: `['游戏']`, `['工具/效率']`, `['教育/学习']`, `['社交/社区']`, `['电商/业务系统']`, `['多媒体/音视频']`
  - Determine from video title/content or ask user

- **Dev Tool Tags** (开发工具):
  - Known values: `['CodeBuddy']`, `['Cursor']`, `['Claude Code']`, `['Figma']`, `['Codex']`, `['OpenClaw']`, `['WorkBuddy']`, `['CloudBase']`
  - `['WorkBuddy']` = tutorial is made with WorkBuddy; `['CloudBase']` is accepted as a platform tag paired with the AI tool when the video explicitly walks through the CloudBase platform surface
  - The list is open — when the video uses a tool not in this list, add it (and update the skill doc) rather than force-fitting a wrong tag
  - **Important**: Do NOT include "CloudBase AI Toolkit" or "MCP" - CloudBase MCP is the default backend service for all tutorials and doesn't need to be explicitly tagged
  - Determine from video title/content or ask user

- **Tech Stack Tags** (技术栈) - Optional:
  - Common values: `['Vue']`, `['React']`, `['小程序原生']`, `['云函数']`, `['云托管']`, `['原生 HTML']`
  - `['原生 HTML']` = hand-written HTML/CSS/JS (no framework), common for WorkBuddy/CodeBuddy one-shot page tutorials
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
- [ ] CloudBase environment is correct (check queryEnv before upload)
- [ ] Thumbnail uploaded to cloud storage successfully
- [ ] Cloud storage URL is permanent (not temporary)
- [ ] Video entry added to TutorialsGrid.tsx with correct format
- [ ] All required tags are filled (terminalTags, appTypeTags, devToolTags)
- [ ] Video is placed at correct position (newest first)
- [ ] ID is unique and follows kebab-case format
- [ ] No duplicate entries exist
- [ ] Entry ported to **both** mirrored copies in the docs site repo (zh + en)
- [ ] `check-en-components.mjs` and `check-i18n-docs.mjs` pass in the docs repo
- [ ] Docs-site branch pushed and the MR link handed to the user

### 8. Sync to the website repo (QBase/cloudbase-docs)

`TutorialsGrid.tsx` is **mirrored** into the docs site repo. The CloudBase-MCP PR alone does not update the live site — the entry must be ported separately.

- **Repo**: `~/Projects/cloudbase-docs-sync-ce945d51` (remote `git@git.woa.com:QBase/cloudbase-docs.git`)
- **Two mirrored copies, both need the same entry** (they are byte-identical today; `TutorialsGrid` is a known untranslated component, so the "English" copy keeps the Chinese video titles — `check-en-components.mjs` classifies it as `Warn`, never `Fail`):
  - `docs/ai/cloudbase-ai-toolkit/components/TutorialsGrid.tsx`
  - `i18n/en/docusaurus-plugin-content-docs/current/ai/cloudbase-ai-toolkit/components/TutorialsGrid.tsx`
- **Branch from `origin/master`**, not from a previous sync branch — those are merged (verify with `git merge-base --is-ancestor <sha> origin/master`) and a stale base drags unrelated diff into the MR
- **Anchor the insert** on `  // 视频` + the first existing video entry, replace with a hit-count check, then confirm `diff <CloudBase-MCP>/doc/components/TutorialsGrid.tsx docs/ai/.../TutorialsGrid.tsx` is empty and the two copies are byte-identical
- **Guards before commit** (both must pass):
  - `node scripts/check-en-components.mjs` → no `Fail`
  - `node scripts/check-i18n-docs.mjs` → i18n pairing check passes
- **MR is created by the user**: the gongfeng MCP gateway is read-only (46 read tools, no `create_merge_request`). Push the branch and hand over the TGIT link printed by the remote (`To create a merge request for <branch>: ...`)

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

1. **Default Search Page**: When command is triggered without a specific URL, automatically open the Bilibili search page for CloudBase videos (sorted by publication date) to help discover new content. **Always run the Relevance Filter (Step 0.5) on the results before presenting or adding** — the raw search is noisy and will otherwise pull in unrelated videos (易支付, OpenStack, K8s, Supabase, etc.).

2. **Environment Check**: Always verify CloudBase environment before uploading. Wrong environment will result in incorrect URLs.

2. **Tag Determination**: 
   - Try to infer tags from video title and description
   - If uncertain, ask user for confirmation
   - Ensure all three required tag types are filled
   - **Never include "CloudBase AI Toolkit" or "MCP" in devToolTags** - CloudBase MCP is the default backend service used by all tutorials
   - **Never include "CloudBase AI Toolkit" or "MCP" in techStackTags** - CloudBase MCP is the default backend service and doesn't need to be explicitly tagged

3. **Thumbnail URL Format**:
   - Use permanent cloud storage URL, not temporary URL
   - Format: `https://{appId}-{envId}-{uin}.tcb.qcloud.la/video-thumbnails/{BV号}.jpg`
   - `appId` and the numeric `uin` suffix are visible in the env's `CdnDomain` returned by `queryEnv` (e.g. `7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la` → AppId `7463`, envId `tcb-advanced-a656fc`, uin `1257967285`)

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

