# Community listing (T10)

Status 2026-08-19:

- [x] GitHub topic `dsh-plugin` on https://github.com/TencentCloudBase/CloudBase-AI-Toolkit
- [ ] npm `@cloudbase/dsh-plugin@0.1.0` (blocked on Booker merge + tag `dsh-plugin-v0.1.0`)
- [ ] Oh-My-DSH curated override (payload below; wait until npm is public, then PR)
- [x] AdamPlatin123/awesome-dsh-plugins auto-index: topic is enough (scan ~8h)

## GitHub topic

Done: `gh repo edit TencentCloudBase/CloudBase-AI-Toolkit --add-topic dsh-plugin`

The plugin lives in `/dsh-plugin` of this repo (npm package `@cloudbase/dsh-plugin`), not a standalone GitHub repo.

## awesome-dsh-plugins

AdamPlatin123/awesome-dsh-plugins indexes the `dsh-plugin` topic automatically. One-liner:

`CloudBase backend for DSH — full-stack apps from chat, DB/Storage/Auth panel, one-click deploy`

## Oh-My-DSH curated list

Repo: https://github.com/like-study1/Oh-My-DSH  
Open a PR against `data/curated.json` **after** `@cloudbase/dsh-plugin@0.1.0` is on npm.

Suggested override:

```json
{
  "cloudbase-dsh-plugin": {
    "repo": "TencentCloudBase/CloudBase-AI-Toolkit",
    "category": "data",
    "note": "CloudBase BaaS inside DSH：对话建全栈、右侧数据库/存储/认证面板、一键静态托管拿域名。device-code 登录，不需要 API Key。安装：dsh plugin add @cloudbase/dsh-plugin（包在仓库 dsh-plugin/ 目录）。",
    "keep": true
  }
}
```

Do not claim official DeepSeek endorsement.

## Install one-liner (after npm publish)

```bash
dsh plugin --profile web add @cloudbase/dsh-plugin
```
