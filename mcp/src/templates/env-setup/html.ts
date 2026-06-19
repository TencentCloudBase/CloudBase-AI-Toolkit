/**
 * HTML template structure
 */

export function buildHTMLPage(css: string, body: string, scripts: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudBase MCP - 环境配置</title>
    ${css}
</head>
<body>
    ${body}
    ${scripts}
</body>
</html>
  `.trim();
}








