const fs = require('fs');
const file = 'config/source/skills/auth-tool/SKILL.md';

let content = fs.readFileSync(file, 'utf8');

// Replace the publishable key section with correct guidance
const oldSection = `### 9. Get Publishable Key

**Query existing key**:
\`\`\`js
{
    "params": { "EnvId": \`env\`, "KeyType": "publish_key", "PageNumber": 1, "PageSize": 10 },
    "service": "lowcode",
    "action": "DescribeApiKeyTokens"
}
\`\`\`
Return \`PublishableKey.ApiKey\` if exists (filter by \`Name == "publish_key"\`).

**Create new key** (if not exists):
\`\`\`js
{
    "params": { "EnvId": \`env\`, "KeyType": "publish_key", "KeyName": "publish_key" },
    "service": "lowcode",
    "action": "CreateApiKeyToken"
}
\`\`\`
If creation fails, direct user to: "https://tcb.cloud.tencent.com/dev?envId=\`env\`#/env/apikey"`;

const newSection = `### 9. Publishable Key Configuration

The CloudBase Web SDK requires a publishable key (\`publishableKey\`) during initialization when interacting with auth and other public APIs.

**Important boundary**: Do NOT attempt to fetch or create the publishable key via MCP tools using \`DescribeApiKeyTokens\` or \`CreateApiKeyToken\`. These actions are not exposed in the standard CloudBase Manager API.

**Correct workflow:**
1. Do not hide or disable the login/registration UI when the key is missing.
2. Provide a configuration step or UI prompt where the developer/user can enter the key.
3. Direct the user to the CloudBase console to generate or retrieve their publishable key:
   \`https://tcb.cloud.tencent.com/dev?envId=YOUR_ENV_ID#/env/apikey\`
4. Instruct the user to save this key in their environment variables (e.g., \`VITE_CLOUDBASE_PUBLISHABLE_KEY\`).`;

content = content.replace(oldSection, newSection);
fs.writeFileSync(file, content);
console.log('Fixed auth-tool/SKILL.md');
