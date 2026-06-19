Connect the current project to Tencent CloudBase

<workflow>
If project is empty or barely started:
  - Check if user's intent fits CloudBase scenarios (WeChat Mini Programs, Web full-stack applications, UniApp cross-platform applications, AI-powered applications)
  - If matches: suggest using `downloadTemplate` tool with `ide: "codebuddy"` parameter
  - If not: only check environment info

If project has existing content:
  - Check if framework is compatible with CloudBase
  - If compatible: offer template downloads with `ide: "codebuddy"` parameter
  - If not: only check environment info

Always verify CloudBase environment connection.
</workflow> 