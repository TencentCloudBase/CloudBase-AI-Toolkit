const fs = require('fs');
const path = require('path');

function fixCloudFunctionsParams(filePath) {
  const fullPath = path.join('/Users/bookerzhao/Projects/cloudbase-turbo-delploy.feature-attribution-api-parameter-docs', filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Add EnvId: "{envId}" to createFunction
  content = content.replace(
    /action: "createFunction",\s*func: \{/g, 
    'action: "createFunction",\n  EnvId: "{envId}",\n  func: {'
  );
  
  // Also add to updateFunctionCode
  content = content.replace(
    /action: "updateFunctionCode",\s*functionName/g, 
    'action: "updateFunctionCode",\n  EnvId: "{envId}",\n  functionName'
  );
  
  fs.writeFileSync(fullPath, content);
  console.log('Fixed', filePath);
}

const files = [
  'config/source/skills/cloud-functions/references/event-functions.md',
  'config/source/skills/cloud-functions/references/http-functions.md',
  'config/source/skills/cloud-functions/references/operations-and-config.md'
];

files.forEach(fixCloudFunctionsParams);
