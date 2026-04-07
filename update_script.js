const fs = require('fs');
const files = [
  'config/source/skills/no-sql-web-sdk/crud-operations.md',
  'config/source/skills/no-sql-wx-mp-sdk/crud-operations.md'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  const nestedUpdateText = `

### Nested Field Updates (Important)

When updating nested object fields, you **must use dot notation** if you want to preserve sibling fields.

**WRONG: This replaces the entire object and deletes sibling fields:**
\`\`\`javascript
// DANGER: If 'user' had an 'email' field, it is now deleted!
await db.collection('profiles')
    .doc('profile-123')
    .update({
        user: {
            name: 'New Name'  // Replaces the ENTIRE 'user' object
        }
    });
\`\`\`

**CORRECT: This only updates the specific nested field:**
\`\`\`javascript
// SAFE: Only updates 'name', preserves 'email' and other fields in 'user'
await db.collection('profiles')
    .doc('profile-123')
    .update({
        'user.name': 'New Name'  // Use dot notation for nested fields
    });
\`\`\`
`;

  // Insert before Update with Operators
  content = content.replace('### Update with Operators', nestedUpdateText.trim() + '\n\n### Update with Operators');
  
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}
