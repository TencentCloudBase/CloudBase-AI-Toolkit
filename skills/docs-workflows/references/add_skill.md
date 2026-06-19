# Add Skill

## Function
Add a new skill (prompt rule) to the CloudBase AI Toolkit project.

## Trigger Condition
When user inputs `/add-skill` or needs to add a new skill/prompt rule

## Workflow

### Step 1: Understand Skill Structure
A skill consists of:
- **Configuration entry** in `doc/prompts/config.yaml`
- **Rule file(s)** in `config/rules/{skill-id}/` directory
- **Generated documentation** in `doc/prompts/{skill-id}.mdx` (auto-generated)
- **Generated prompts data** in `doc/components/prompts.json` (auto-generated from config.yaml)
- **UI component entry** in `doc/components/PromptScenarios.tsx` (manual update)

### Step 2: Create Rule File(s)
Create the rule file(s) in `config/rules/{skill-id}/` directory:

1. **Main rule file**: `config/rules/{skill-id}/rule.md`
   - Must include frontmatter with `name` and `description`
   - Should follow the standard structure:
     ```markdown
     ---
     name: skill-id
     description: Brief description of the skill
     alwaysApply: false
     ---
     
     # Skill Title
     
     Brief description of when to use this skill.
     
     ## When to use this skill
     
     Use this skill when...
     
     ## How to use this skill (for a coding agent)
     
     1. First step
     2. Second step
     ...
     
     ## Core Knowledge
     
     Detailed knowledge and guidelines...
     ```

2. **Optional sub-files**: If the skill is complex, you can split it into multiple files:
   - `rule.md` - Main rule file
   - `{topic}.md` - Sub-topics (e.g., `crud-operations.md`, `pagination.md`)
   - All files in the directory will be included in the generated documentation

### Step 3: Add Configuration to config.yaml
Add a new entry to `doc/prompts/config.yaml`:

```yaml
  - id: skill-id
    title: Skill Title (Chinese)
    description: Skill description (Chinese)
    category: category-id  # auth, database, backend, frontend, or tools
    order: number  # Order within the category
    prompts:
      - "Example prompt 1"
      - "Example prompt 2"
    # Optional: if rule files are in a different directory
    # ruleDir: different-directory-name
```

**Important Notes:**
- `id` must match the directory name in `config/rules/`
- `category` must be one of: `auth`, `database`, `backend`, `frontend`, `tools`
- `order` determines the display order within the category
- `prompts` are example prompts users can try

### Step 4: Generate Documentation and Prompts Data
Run the generation scripts to create the MDX documentation and prompts JSON:

```bash
# Generate MDX documentation from rule files
node scripts/generate-prompts.mjs

# Generate prompts.json from config.yaml (for AIDevelopmentPrompt component)
npm run build:prompts-data
```

This will:
- Generate `doc/prompts/{skill-id}.mdx` from the rule files
- Update `doc/sidebar.json` automatically
- Generate `doc/components/prompts.json` from `config.yaml` (used by `AIDevelopmentPrompt` component)

### Step 5: Update PromptScenarios Component
Manually add the new skill to `doc/components/PromptScenarios.tsx`:

1. Find the appropriate category section
2. Add a new entry following the existing format:

```typescript
{
  id: 'skill-id',
  title: 'Skill Title',
  description: 'Skill description',
  category: 'Category Name (Chinese)',
  docUrl: '/ai/cloudbase-ai-toolkit/prompts/skill-id',
},
```

**Category Mapping:**
- `auth` → `'身份认证'`
- `database` → `'数据库'`
- `backend` → `'后端开发'`
- `frontend` → `'应用集成'`
- `tools` → `'开发工具'`

### Step 6: Verify Generated Files
Check that:
- ✅ `doc/prompts/{skill-id}.mdx` exists and has correct content
- ✅ `doc/sidebar.json` includes the new skill in the correct category
- ✅ `doc/components/prompts.json` includes the new skill with all prompts
- ✅ `doc/components/PromptScenarios.tsx` includes the new skill
- ✅ Rule files are properly formatted with frontmatter

### Step 7: Test the Skill
1. Verify the generated MDX file renders correctly
2. Check that the skill appears in the UI components
3. Test that example prompts work as expected

## Important Notes

### Rule File Best Practices
1. **Frontmatter is required**: Every rule file must have YAML frontmatter
2. **Clear structure**: Follow the standard structure (When to use, How to use, Core Knowledge)
3. **English content**: Rule files should be in English (documentation is auto-generated in Chinese)
4. **Code examples**: Include practical code examples when relevant
5. **Tool references**: Reference specific MCP tools when applicable

### Category Guidelines
- **auth**: Authentication-related skills (login, signup, user management)
- **database**: Database operations (NoSQL, MySQL, data modeling)
- **backend**: Backend services (cloud functions, cloudrun)
- **frontend**: Frontend integration (Web, mini program, UI design)
- **tools**: Development tools and workflows (spec workflow, platform knowledge)

### File Naming Conventions
- Skill ID: lowercase, hyphen-separated (e.g., `cloud-functions`, `auth-web`)
- Rule file: Always `rule.md` for the main file
- Sub-files: Descriptive names (e.g., `crud-operations.md`, `pagination.md`)

## Example

```
/add-skill I need to add a new skill for "Cloud Storage Web SDK"

→ Guide through all 7 steps to add complete skill support
```

## Success Criteria

- [ ] Rule file(s) created in `config/rules/{skill-id}/`
- [ ] Configuration added to `doc/prompts/config.yaml`
- [ ] Documentation generated via `node scripts/generate-prompts.mjs`
- [ ] Prompts data generated via `npm run build:prompts-data`
- [ ] Entry added to `doc/components/PromptScenarios.tsx`
- [ ] Generated MDX file exists and is correct
- [ ] Generated `prompts.json` includes the new skill
- [ ] Sidebar updated automatically
- [ ] All files verified and tested


