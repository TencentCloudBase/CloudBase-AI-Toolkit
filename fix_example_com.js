const fs = require('fs');
const path = require('path');

function replaceExampleCom(filePath) {
  const fullPath = path.join('/Users/bookerzhao/Projects/cloudbase-turbo-delploy.feature-attribution-api-parameter-docs', filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  content = content.replace(/user@example\.com/g, 'user@your-domain.com');
  content = content.replace(/new@example\.com/g, 'new@your-domain.com');
  content = content.replace(/sender@example\.com/g, 'sender@your-domain.com');
  fs.writeFileSync(fullPath, content);
  console.log('Fixed', filePath);
}

const files = [
  'config/source/skills/cloudbase-agent/py/references/tools.md',
  'config/source/skills/auth-tool/SKILL.md',
  'config/source/skills/no-sql-web-sdk/complex-queries.md',
  'config/source/skills/auth-nodejs/SKILL.md',
  'config/source/skills/auth-web/SKILL.md',
  'config/source/skills/no-sql-wx-mp-sdk/complex-queries.md'
];

files.forEach(replaceExampleCom);
