import { defineModule } from "../types.js";

export const rag = defineModule(
  {
    title: "云开发知识库检索",
    description:
      `云开发知识库检索工具，支持 CloudBase 官方文档 (docs)、固定技能文档 (skill) 和 OpenAPI 文档 (openapi) 查询。

      按场景选择 mode：
      - 工具调用报错且错误信息含具体错误码（如 OperationDenied.FreePackageDenied）时：mode=docs + action=searchDocs（query=错误码），先查错误码官方含义与处理指引再行动，不要凭猜测重试
      - 不确定答案在哪、需要对官方文档做全文检索时：mode=docs + action=searchDocs（传 query 关键词）
      - 已知文档标题、层级路径或 URL 时：mode=docs + action=findByName（传 input）或 action=readDoc（传 docPath）
      - 需要某个场景的落地指南 / 最佳实践时：mode=skill + skillName
      - 需要 HTTP API 的接口定义时：mode=openapi + apiName

      ⚠️ 重要：当 CloudBase skills 处于禁用状态或当前 IDE 不支持 skill 文件读取时，必须使用 searchKnowledgeBase(mode=skill, skillName=...) 来获取 CloudBase 技能文档内容，而不是尝试直接读取 skill 文件。直接读取可能返回 400 错误。示例：
      - 需要最小 Web+数据库 Demo 路径时：searchKnowledgeBase(mode=skill, skillName=minimal-web-baas-demo)
      - 需要 auth-tool 指南时：searchKnowledgeBase(mode=skill, skillName=auth-tool)
      - 需要 auth-web 指南时：searchKnowledgeBase(mode=skill, skillName=auth-web)
      - 需要 cloudbase-agent 指南时：searchKnowledgeBase(mode=skill, skillName=cloudbase-agent)

      返回内容包含该 skill 的 SKILL.md 全文，以及它在远端聚合仓（CNB raw）中的全部 .md 文件地址清单（SKILL.md 与 references/ 等，可直接 HTTP 抓取）。正文中代码栅栏之外的相对链接也会改写为绝对地址；若该 skill 在远端仓中不存在，则只返回内联内容并明确标注，不返回失效链接。

      固定技能文档 (skill) 查询当前支持 {skillCount} 个固定文档，分别是：
      {skillList}

      OpenAPI 文档 (openapi) 查询只需要传 mode="openapi" 和 apiName，不要传 action；action 仅用于 mode="docs"。当前支持 {openapiCount} 个 API 文档，分别是：
      {openapiList}`,
    skillListItem: "文档名：{name} 文档介绍：{description}",
    openapiListItem: "API名：{name} API介绍：{description}",
    paramRequired: "action={action} 时必须提供 {param}",
    actionRequired: "mode=docs 时必须提供 action",
    docsUnsupported: "当前 @cloudbase/manager-node 实例不支持 app.docs，请确认版本 >= 5.0.0。",
    listModulesSuccess: "CloudBase 文档模块列表获取成功",
    listModuleDocsSuccess: "CloudBase 模块文档目录获取成功",
    findByNameSuccess: "CloudBase 文档查找成功",
    readDocSuccess: "CloudBase 文档读取成功",
    searchDocsSuccess: "CloudBase 文档搜索成功",
    skillNotFound:
      "未找到技能文档 \"{skillName}\"。可用技能文档：{available}。{remoteHint}",
    skillRemoteHint: " 你也可以直接从这个地址获取技能文档：{url}",
    skillRemote:
      "技能文档地址：{url}\n请通过 HTTP 拉取该远程 URL。cloud mode 下无法使用本地文件路径。",
    skillLocal: "技能文档的绝对路径是：{path}。{content}",
    skillContentHeading: "--- SKILL.md 正文 ---\n{body}",
    skillRemoteFileListHeader:
      "技能 \"{skillName}\" 的远端镜像（CNB raw，以下地址按需抓取）：",
    skillRemoteMissing:
      "技能 \"{skillName}\" 不在远端 CloudBase 技能聚合仓中（HTTP 404）；为避免失效链接，不返回任何远端文件地址。",
    skillRemoteProbeFailed:
      "无法确认技能 \"{skillName}\" 的远端地址（探测失败）；不返回可能已过期的远端文件地址。",
    openapiNotFound: "未找到 OpenAPI 文档 \"{apiName}\"。可用的 API：{available}",
    openapiRemote:
      "OpenAPI 文档：{name}\n简介：{description}\nURL：{url}\n\n请通过 HTTP 拉取该远程 URL。cloud mode 下无法使用本地文件路径。",
    openapiLocal:
      "OpenAPI 文档：{name}\n简介：{description}\n路径：{path}\n\n{content}",
    unsupportedMode: "不支持的 mode：{mode}",
    downloadTemplateFailed: "下载模板失败，状态码: {status}",
  },
  {
    title: "CloudBase knowledge base search",
    description:
      `CloudBase knowledge base search tool. Supports CloudBase official docs (docs), fixed skill docs (skill), and OpenAPI docs (openapi).

      Choose mode by scenario:
      - A tool call failed with an error code in the message (e.g. OperationDenied.FreePackageDenied): mode=docs + action=searchDocs (query=error code). Look up the official meaning and guidance of the error code before acting; do not retry on guesses.
      - Unsure where the answer is and need a full-text search over official docs: mode=docs + action=searchDocs (pass query keywords)
      - You know the doc title, hierarchical path, or URL: mode=docs + action=findByName (pass input) or action=readDoc (pass docPath)
      - Need a hands-on guide / best practices for a scenario: mode=skill + skillName
      - Need an HTTP API definition: mode=openapi + apiName

      ⚠️ Important: when CloudBase skills are disabled or the current IDE does not support reading skill files, use searchKnowledgeBase(mode=skill, skillName=...) to get CloudBase skill doc content instead of trying to read skill files directly. Direct reads may return 400 errors. Examples:
      - Minimal Web+database demo path: searchKnowledgeBase(mode=skill, skillName=minimal-web-baas-demo)
      - auth-tool guide: searchKnowledgeBase(mode=skill, skillName=auth-tool)
      - auth-web guide: searchKnowledgeBase(mode=skill, skillName=auth-web)
      - cloudbase-agent guide: searchKnowledgeBase(mode=skill, skillName=cloudbase-agent)

      The response contains the full SKILL.md of the skill plus the list of all its .md file URLs in the remote aggregate repo (CNB raw) — SKILL.md and references/ etc., fetchable over HTTP. Relative links outside code fences are rewritten to absolute URLs; when the skill is absent from the remote repo only the inline content is returned and that is stated explicitly, so no dead links are handed out.

      Fixed skill doc (skill) queries currently support {skillCount} fixed docs:
      {skillList}

      OpenAPI doc (openapi) queries only need mode="openapi" and apiName; do not pass action — action is only for mode="docs". Currently {openapiCount} API docs are supported:
      {openapiList}`,
    skillListItem: "Skill: {name} — Description: {description}",
    openapiListItem: "API: {name} — Description: {description}",
    paramRequired: "{param} is required when action={action}",
    actionRequired: "action is required when mode=docs",
    docsUnsupported: "The current @cloudbase/manager-node instance does not support app.docs. Please make sure the version is >= 5.0.0.",
    listModulesSuccess: "CloudBase doc module list retrieved successfully",
    listModuleDocsSuccess: "CloudBase module doc catalog retrieved successfully",
    findByNameSuccess: "CloudBase doc lookup succeeded",
    readDocSuccess: "CloudBase doc read successfully",
    searchDocsSuccess: "CloudBase doc search succeeded",
    skillNotFound:
      "Skill document \"{skillName}\" not found. Available skill docs: {available}.{remoteHint}",
    skillRemoteHint: " You can also try fetching the skill doc directly from: {url}",
    skillRemote:
      "The skill doc is available at: {url}\nFetch this remote URL over HTTP. Local file paths are not available in cloud mode.",
    skillLocal: "The skill doc's absolute path is: {path}. {content}",
    skillContentHeading: "--- SKILL.md content ---\n{body}",
    skillRemoteFileListHeader:
      "Remote mirror of skill \"{skillName}\" (CNB raw, fetch these URLs on demand):",
    skillRemoteMissing:
      "Skill \"{skillName}\" is not present in the remote CloudBase skills repository (HTTP 404); no remote file URLs are provided to avoid dead links.",
    skillRemoteProbeFailed:
      "Could not confirm the remote address for skill \"{skillName}\" (probe failed); no possibly-stale remote file URLs are provided.",
    openapiNotFound: "OpenAPI document \"{apiName}\" not found. Available APIs: {available}",
    openapiRemote:
      "OpenAPI document: {name}\nDescription: {description}\nURL: {url}\n\nFetch this remote URL over HTTP. Local file paths are not available in cloud mode.",
    openapiLocal:
      "OpenAPI document: {name}\nDescription: {description}\nPath: {path}\n\n{content}",
    unsupportedMode: "unsupported mode: {mode}",
    downloadTemplateFailed: "Failed to download template, status code: {status}",
  },
);
