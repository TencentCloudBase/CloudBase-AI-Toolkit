const fs = require('fs');
let content = fs.readFileSync('src/tools/databaseNoSQL.test.ts', 'utf8');

// Fix line 284: add quotes around Chinese string
content = content.replace(
  'expect(toolsDoc).toContain(嵌套对象局部更新必须使用点号路径);',
  'expect(toolsDoc).toContain(\'嵌套对象局部更新必须使用点号路径\');'
);

fs.writeFileSync('src/tools/databaseNoSQL.test.ts', content, 'utf8');
console.log('Fixed line 284');
