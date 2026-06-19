# Add AI IDE Support

## Function
Add support for a new AI IDE to the CloudBase AI Toolkit project.

## Trigger Condition
When user inputs `/add-aiide` or needs to add support for a new AI IDE

## Workflow

### Step 1: Create IDE-specific Configuration Files
Create the necessary configuration files for the new IDE:
- Create IDE-specific configuration files (e.g., `.mcp.json`, `CLAUDE.md`, or IDE-specific rules files)
- Place them in the appropriate directory structure under `config/` directory
- Ensure file naming follows the existing conventions

### Step 2: Fetch and Upload IDE Icon
Get the IDE icon from the official website and upload it to cloud storage:

#### 2.1 Use Browser Tools to Find Icon
1. **Navigate to IDE official website** using `browser_navigate`:
   - Open the IDE's official website (e.g., `https://ide-name.com`)
   
2. **Find favicon or logo**:
   - Use `browser_snapshot` to capture the page accessibility snapshot
   - Look for favicon links in the HTML (typically in `<link rel="icon">` or `<link rel="apple-touch-icon">`)
   - Check common favicon locations:
     - `/favicon.ico`
     - `/favicon.png`
     - `/apple-touch-icon.png`
     - `/logo.png` or `/logo.svg`
   
3. **Download the icon**:
   - Use `downloadRemoteFile` tool to download the icon to a temporary local path
   - Example: Download to `/tmp/ide-icon.png`
   - **Preferred formats**: PNG (for raster) or SVG (for vector)
   - **Recommended size**: 128x128px or larger for PNG, or SVG for scalability

#### 2.2 Upload Icon to Cloud Storage
1. **Upload to cloud storage** using `manageStorage` tool:
   ```typescript
   // Upload icon to cloud storage
   manageStorage({
     action: "upload",
     localPath: "/tmp/ide-icon.png", // Absolute path to downloaded icon
     cloudPath: "assets/ide-icons/new-ide.png", // Cloud storage path
     isDirectory: false
   })
   ```

2. **Get temporary URL** (optional, if needed immediately):
   - The upload response will include a temporary URL
   - Or use `queryStorage` with `action: "url"` to get a permanent download URL

3. **Use the cloud storage URL**:
   - Use the cloud storage URL in component configurations
   - Format: `https://your-env-id.tcb.qcloud.la/assets/ide-icons/new-ide.png`
   - Or use the temporary URL if it's a long-term asset

**Icon Format Guidelines**:
- **PNG**: Preferred for raster icons, minimum 128x128px, transparent background if possible
- **SVG**: Preferred for vector icons (scalable, smaller file size)
- **ICO**: Can be converted to PNG if needed
- **Apple Touch Icon**: Usually high quality, good choice if available

**Icon Source Priority**:
1. **lobe-icons repository**: Check first - if available, use `iconSlug` (no upload needed)
2. **Official website favicon/apple-touch-icon**: High quality, official branding
3. **GitHub repository**: Check if IDE has a GitHub repo with logo assets
4. **Documentation site**: Check IDE's documentation site for logo assets

**Alternative**: If the IDE has an icon in [lobe-icons](https://github.com/lobehub/lobe-icons), you can use `iconSlug` instead:
- Check if the icon exists in lobe-icons repository
- If available, use `iconSlug: "ide-name"` in component configuration
- This avoids the need to upload custom icons
- Common icon slugs: `cursor`, `claude`, `gemini`, `windsurf`, `cline`, `qwen`, etc.

### Step 3: Update Hardlink Script
Update `scripts/fix-config-hardlinks.mjs` to add new target files to the hardlink list:
- Add new rule file paths to `RULES_TARGETS` array (if applicable)
- Add new MCP config paths to `MCP_TARGETS` array (if applicable)
- Ensure the source files are correctly referenced

### Step 4: Execute Hardlink Script
Run the hardlink script to ensure rule files are synchronized:
```bash
node scripts/fix-config-hardlinks.mjs
```

### Step 5: Create IDE Setup Documentation
Create `doc/ide-setup/{ide-name}.md` configuration documentation:
- Follow the existing IDE setup documentation format
- Include installation instructions
- Include configuration steps
- Include usage examples

### Step 6: Update Documentation Lists and UI Components
Update AI IDE support lists in:
- `README.md` - Add to IDE support list, **pay attention to detail section content**
- `doc/index.mdx` - Add to IDE listing
- `doc/faq.md` - Add relevant FAQ entries if needed

#### 6.1 Update IDESelector Component
Add the new IDE to `doc/components/IDESelector.tsx` in the `IDES` array:
```typescript
const IDES: IDE[] = [
  // ... existing IDEs
  {
    id: 'new-ide',
    name: 'New IDE',
    platform: 'Platform Type',
    configPath: '.new-ide/mcp.json',
    iconSlug: 'new-ide', // or iconUrl: 'https://...'
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/new-ide',
    supportsProjectMCP: true, // or false
    verificationPrompt: '调用 MCP 工具下载 CloudBase AI 开发规则到当前项目，然后介绍CloudBase MCP 的所有功能',
    configExample: `{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "New IDE"
      }
    }
  }
}`,
    // Add other optional fields as needed:
    // cliCommand, alternativeConfig, installCommand, etc.
  },
];
```

**Required fields:**
- `id`: IDE identifier (lowercase, hyphen-separated)
- `name`: Display name
- `platform`: Platform description
- `configPath`: Configuration file path
- `configExample`: JSON configuration example with correct `INTEGRATION_IDE` value
- `docUrl`: Link to setup documentation

**Optional fields:**
- `iconSlug`: Icon slug for lobe-icons (if available)
- `iconUrl`: Direct icon URL (if iconSlug not available)
- `supportsProjectMCP`: Whether IDE supports project-level MCP
- `verificationPrompt`: Custom verification prompt
- `cliCommand`: CLI command for installation
- `alternativeConfig`: Alternative configuration description
- `installCommand`: Installation command
- `installCommandDocs`: Installation documentation
- `useCommandInsteadOfConfig`: Use command instead of config file
- `oneClickInstallUrl`: One-click install URL
- `oneClickInstallImage`: One-click install image URL

#### 6.2 Update IDEIconGrid Component
Add the new IDE to `doc/components/IDEIconGrid.tsx` in the `IDES` array:
```typescript
const IDES: IDE[] = [
  // ... existing IDEs
  {
    id: 'new-ide',
    name: 'New IDE',
    platform: 'Platform Type',
    iconSlug: 'new-ide', // or iconUrl: 'https://...'
    docUrl: '/ai/cloudbase-ai-toolkit/ide-setup/new-ide',
  },
];
```

**Note**: The `IDEIconGrid` component uses a simplified structure, only requiring:
- `id`: IDE identifier
- `name`: Display name
- `platform`: Platform description (for reference)
- `iconSlug` or `iconUrl`: Icon source
- `docUrl`: Link to setup documentation

### Step 7: Update IDE File Mappings in Code
Update IDE mappings in `mcp/src/tools/setup.ts`:

#### 7.1 Add to IDE_TYPES Array
Add the new IDE type to the `IDE_TYPES` constant array:
```typescript
const IDE_TYPES = [
  // ... existing types
  "new-ide", // New IDE type
] as const;
```

#### 7.2 Add to RAW_IDE_FILE_MAPPINGS
Add file mapping in `RAW_IDE_FILE_MAPPINGS` object:
```typescript
export const RAW_IDE_FILE_MAPPINGS: Record<string, IdeFileDescriptor[]> = {
  // ... existing mappings
  "new-ide": [
    { path: ".new-ide/rules/" },
    { path: ".new-ide/mcp.json", isMcpConfig: true },
  ],
};
```

#### 7.3 Add to IDE_DESCRIPTIONS
Add description in `IDE_DESCRIPTIONS` object:
```typescript
const IDE_DESCRIPTIONS: Record<string, string> = {
  // ... existing descriptions
  "new-ide": "New IDE AI Editor",
};
```

#### 7.4 Add to INTEGRATION_IDE_MAPPING
Add environment variable mapping in `INTEGRATION_IDE_MAPPING` object:
```typescript
const INTEGRATION_IDE_MAPPING: Record<string, string> = {
  // ... existing mappings
  "New IDE": "new-ide", // Map environment variable value to IDE type
};
```

**Note**: `ALL_IDE_FILES` is automatically calculated from `IDE_FILE_MAPPINGS`, so no manual update needed.

### Step 7: Update Documentation Components
Update React components that display IDE lists:
- **IDESelector.tsx**: Add full IDE configuration with all required and optional fields
- **IDEIconGrid.tsx**: Add simplified IDE entry for icon grid display

**Important**: Ensure the `INTEGRATION_IDE` value in `configExample` matches the value in `INTEGRATION_IDE_MAPPING` from Step 7.4.

### Step 9: Verify Hardlink Status and Documentation
- Verify that hardlinks are correctly created
- Check that all configuration files are properly linked
- Ensure documentation is complete and accurate
- Verify that IDE appears correctly in UI components

### Step 10: Test IDE-specific Download Functionality
Test the IDE-specific download feature:
- Test downloading templates with the new IDE type
- Verify that only relevant files are included
- Ensure the filtering logic works correctly
- Test that IDE selector and icon grid display the new IDE correctly

## Important Notes

1. **File Naming Conventions**: Follow existing naming patterns for consistency
2. **Directory Structure**: Maintain the same directory structure as other IDE configurations
3. **MCP Configuration**: If the IDE supports MCP, ensure `.mcp.json` is properly configured
4. **Documentation**: Always update all relevant documentation files
5. **Testing**: Thoroughly test the new IDE support before marking as complete

## Example

```
/add-aiide I need to add support for "NewIDE" AI editor
→ Guide through all 10 steps to add complete IDE support
```

## Success Criteria

- [ ] IDE-specific configuration files created
- [ ] IDE icon fetched from official website and uploaded to cloud storage
- [ ] Hardlink script updated and executed
- [ ] IDE setup documentation created
- [ ] All documentation files updated (README.md, doc/index.mdx, doc/faq.md)
- [ ] UI components updated with correct icon URLs (IDESelector.tsx, IDEIconGrid.tsx)
- [ ] Code mappings updated (IDE_TYPES, RAW_IDE_FILE_MAPPINGS, IDE_DESCRIPTIONS, INTEGRATION_IDE_MAPPING)
- [ ] Hardlinks verified
- [ ] IDE-specific download functionality tested and working
- [ ] IDE appears correctly in documentation UI with proper icon display
