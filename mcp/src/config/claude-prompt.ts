// Fallback CLAUDE.md prompt content
// This is used when template download fails or CLAUDE.md is not found in the template
export const FALLBACK_CLAUDE_PROMPT = `---
description: CloudBase AI Development Rules Guide - Provides scenario-based best practices to ensure development quality
globs: *
alwaysApply: true
---

# CloudBase AI Development Rules Guide

## Quick Reference for AI

**⚠️ CRITICAL: Read this section first based on your project type**

### When Developing a Web Project:
1. **Environment Check**: Call \`envQuery\` tool first (applies to all interactions)
2. **⚠️ Template Download (MANDATORY for New Projects)**: **MUST call \`downloadTemplate\` tool FIRST when starting a new project** - Do NOT create files manually. Use \`downloadTemplate\` with \`template="react"\` or \`template="vue"\` to get the complete project structure. Only proceed with manual file creation if template download fails or user explicitly requests it.
3. **⚠️ UI Design (CRITICAL)**: **MUST read \`rules/ui-design/rule.md\` FIRST before generating any page, interface, component, or style** - This is NOT optional. You MUST explicitly read this file and output the design specification before writing any UI code.
4. **Core Capabilities**: Read Core Capabilities section below (especially UI Design and Database + Authentication for Web)
5. **Platform Rules**: Read \`rules/web-development/rule.md\` for platform-specific rules (SDK integration, static hosting, build configuration)
6. **Authentication**: Read \`rules/auth-web/rule.md\` - **MUST use Web SDK built-in authentication**
7. **Database**: 
   - NoSQL: \`rules/no-sql-web-sdk/rule.md\`
   - MySQL: \`rules/relational-database-web/rule.md\` + \`rules/relational-database-mcp/rule.md\`

### When Developing a Mini Program Project:
1. **Environment Check**: Call \`envQuery\` tool first (applies to all interactions)
2. **⚠️ Template Download (MANDATORY for New Projects)**: **MUST call \`downloadTemplate\` tool FIRST when starting a new project** - Do NOT create files manually. Use \`downloadTemplate\` with \`template="miniprogram"\` to get the complete project structure. Only proceed with manual file creation if template download fails or user explicitly requests it.
3. **⚠️ UI Design (CRITICAL)**: **MUST read \`rules/ui-design/rule.md\` FIRST before generating any page, interface, component, or style** - This is NOT optional. You MUST explicitly read this file and output the design specification before writing any UI code.
4. **Core Capabilities**: Read Core Capabilities section below (especially UI Design and Database + Authentication for Mini Program)
5. **Platform Rules**: Read \`rules/miniprogram-development/rule.md\` for platform-specific rules (project structure, WeChat Developer Tools, wx.cloud usage)
6. **Authentication**: Read \`rules/auth-wechat/rule.md\` - **Naturally login-free, get OPENID in cloud functions**
7. **Database**: 
   - NoSQL: \`rules/no-sql-wx-mp-sdk/rule.md\`
   - MySQL: \`rules/relational-database-mcp/rule.md\` (via MCP tools)

---

## Core Capabilities (Must Be Done Well)

As the most important part of application development, the following four core capabilities must be done well, without needing to read different rules for different platforms:

### 1. ⚠️ UI Design (CRITICAL - Highest Priority)
**⚠️ MANDATORY: Must strictly follow \`rules/ui-design/rule.md\` rules for ALL design work**

**🚨 CRITICAL ENFORCEMENT: You MUST explicitly read the file \`rules/ui-design/rule.md\` before generating ANY UI code. This is NOT a suggestion - it is a MANDATORY requirement.**

**Before generating ANY page, interface, component, or style:**
1. **MUST FIRST explicitly read \`rules/ui-design/rule.md\` file** - Use file reading tools to read this file, do NOT skip this step
2. **MUST complete design specification output** before writing any code:
   - Purpose Statement
   - Aesthetic Direction (choose from specific options, NOT generic terms)
   - Color Palette (with hex codes, avoid forbidden colors)
   - Typography (specific font names, avoid forbidden fonts)
   - Layout Strategy (asymmetric/creative approach, avoid centered templates)
3. **MUST ensure** generated interfaces have distinctive aesthetic styles and high-quality visual design
4. **MUST avoid** generic AI aesthetics (common fonts, clichéd color schemes, templated designs)

**This applies to ALL tasks involving:**
- Page generation
- Interface creation
- Component design
- Style/visual effects
- Any frontend visual elements

**⚠️ VIOLATION DETECTION: If you find yourself writing UI code without first reading \`rules/ui-design/rule.md\`, STOP immediately and read the file first.**

### 2. Database + Authentication
**Strengthen database and authentication capabilities**

**Authentication**:
- **Web Projects**: 
  - Must use CloudBase Web SDK built-in authentication, refer to \`rules/auth-web/rule.md\`
  - Platform development rules: Refer to \`rules/web-development/rule.md\` for Web SDK integration, static hosting deployment, and build configuration
- **Mini Program Projects**: 
  - Naturally login-free, get \`wxContext.OPENID\` in cloud functions, refer to \`rules/auth-wechat/rule.md\`
  - Platform development rules: Refer to \`rules/miniprogram-development/rule.md\` for mini program project structure, WeChat Developer Tools integration, and CloudBase capabilities
- **Node.js Backend**: Refer to \`rules/auth-nodejs/rule.md\`

**Database Operations**:
- **Web Projects**:
  - NoSQL Database: Refer to \`rules/no-sql-web-sdk/rule.md\`
  - MySQL Relational Database: Refer to \`rules/relational-database-web/rule.md\` (Web application development) and \`rules/relational-database-mcp/rule.md\` (Management via MCP tools)
  - Platform development rules: Refer to \`rules/web-development/rule.md\` for Web SDK database integration patterns
- **Mini Program Projects**:
  - NoSQL Database: Refer to \`rules/no-sql-wx-mp-sdk/rule.md\`
  - MySQL Relational Database: Refer to \`rules/relational-database-mcp/rule.md\` (via MCP tools)
  - Platform development rules: Refer to \`rules/miniprogram-development/rule.md\` for mini program database integration and wx.cloud usage
- **Data Model Creation** (Universal): Refer to \`rules/data-model-creation/rule.md\`

### 3. Static Hosting Deployment (Web)
**Refer to deployment process in \`rules/web-development/rule.md\`**
- Use CloudBase static hosting after build completion
- Deploy using \`uploadFiles\` tool
- Remind users that CDN has a few minutes of cache after deployment
- Generate markdown format access links with random queryString

### 4. Backend Deployment (Cloud Functions or CloudRun)
**Refer to \`rules/cloudrun-development/rule.md\`**
- **Cloud Function Deployment**: Prefer \`queryFunctions\` to inspect current state, then use \`manageFunctions\` with \`action="createFunction"\` or \`action="updateFunctionCode"\`
- **CloudRun Deployment**: Use \`manageCloudRun\` tool for containerized deployment
- Ensure backend code supports CORS, prepare Dockerfile (for container type)

## Development Process Standards

**Important: To ensure development quality, AI must complete the following steps before starting work:**

### 0. Environment Check (First Step)
After user inputs any content, first check CloudBase environment status:
- Ensure current CloudBase environment ID is known
- If not present in conversation history, must call \`envQuery\` tool with parameter \`action=info\` to query current environment information and environment ID
- **Important**: When environment ID configuration is involved in code later, automatically use the queried environment ID, no need for manual user input

### 1. Scenario Identification
Identify current development scenario type, mainly for understanding project type, but core capabilities apply to all projects:
- **Web Projects**: React/Vue/native JS frontend projects
- **WeChat Mini Programs**: Mini program CloudBase projects
- **CloudRun Projects**: CloudBase Run backend service projects (supports any language: Java/Go/Python/Node.js/PHP/.NET, etc.)
- **Database Related**: Projects involving data operations
- **UI Design/Interface Generation**: Projects requiring interface design, page generation, prototype creation, component design, etc.

### 2. Platform-Specific Quick Guide

**Web Projects - Required Rule Files:**
- \`rules/web-development/rule.md\` - Platform development rules (SDK integration, static hosting, build configuration)
- \`rules/auth-web/rule.md\` - Authentication (MUST use Web SDK built-in authentication)
- \`rules/no-sql-web-sdk/rule.md\` - NoSQL database operations
- \`rules/relational-database-web/rule.md\` - MySQL database operations (Web)
- \`rules/relational-database-mcp/rule.md\` - MySQL database management (MCP tools)
- \`rules/cloudbase-platform/rule.md\` - Universal CloudBase platform knowledge

**Mini Program Projects - Required Rule Files:**
- \`rules/miniprogram-development/rule.md\` - Platform development rules (project structure, WeChat Developer Tools, wx.cloud)
- \`rules/auth-wechat/rule.md\` - Authentication (naturally login-free, get OPENID in cloud functions)
- \`rules/no-sql-wx-mp-sdk/rule.md\` - NoSQL database operations
- \`rules/relational-database-mcp/rule.md\` - MySQL database operations (via MCP tools)
- \`rules/cloudbase-platform/rule.md\` - Universal CloudBase platform knowledge

**Universal Rule Files (All Projects):**
- **⚠️ \`rules/ui-design/rule.md\`** - **MANDATORY - HIGHEST PRIORITY** - Must read FIRST before any UI/page/component/style generation
- \`rules/data-model-creation/rule.md\` - Data model creation and MySQL modeling
- \`rules/spec-workflow/rule.md\` - Standard software engineering process (if needed)

### 3. Development Confirmation
Before starting work, suggest confirming with user:
1. "I identify this as a [scenario type] project"
2. "I will strictly follow core capability requirements and refer to relevant rule files"
3. "Please confirm if my understanding is correct"

## Core Behavior Rules
1. **Tool Priority**: For Tencent CloudBase operations, must prioritize using CloudBase MCP tools
2. **⚠️ Template Download (MANDATORY)**: **When starting a new project or when user requests to develop an application, MUST FIRST call \`downloadTemplate\` tool** - Do NOT manually create project files. Use \`downloadTemplate\` with appropriate template type (\`react\`, \`vue\`, \`miniprogram\`, \`uniapp\`). Only create files manually if template download fails or user explicitly requests manual creation. This ensures proper project structure, configuration files, and best practices.
3. **Project Understanding**: First read current project's README.md, follow project instructions for development
4. **Directory Standards**: Before outputting project code in current directory, first check current directory files
5. **Development Order**: When developing, prioritize frontend first, then backend, ensuring frontend interface and interaction logic are completed first, then implement backend business logic
6. **⚠️ UI Design Rules Mandatory Application**: When tasks involve generating pages, interfaces, components, styles, or any frontend visual elements, **MUST FIRST explicitly read the file \`rules/ui-design/rule.md\` using file reading tools**, then strictly follow the rule file, ensuring generated interfaces have distinctive aesthetic styles and high-quality visual design, avoiding generic AI aesthetics. **You MUST output the design specification before writing any UI code.**
7. **Backend Development Priority Strategy**: When developing backend, prioritize using SDK to directly call CloudBase database, rather than through cloud functions, unless specifically needed (such as complex business logic, server-side computation, calling third-party APIs, etc.)
8. **Deployment Order**: When there are backend dependencies, prioritize deploying backend before previewing frontend
9. **Interactive Confirmation**: Use interactiveDialog to clarify when requirements are unclear, must confirm before executing high-risk operations
10. **Real-time Communication**: Use CloudBase real-time database watch capability
11. **⚠️ Authentication Rules**: When users develop projects, if user login authentication is needed, must use built-in authentication functions, must strictly distinguish authentication methods by platform
   - **Web Projects**: **MUST use CloudBase Web SDK built-in authentication** (e.g., \`auth.toDefaultLoginPage()\`), refer to \`rules/auth-web/rule.md\`
   - **Mini Program Projects**: **Naturally login-free**, get \`wxContext.OPENID\` in cloud functions, refer to \`rules/auth-wechat/rule.md\`

## Development Workflow

### Development

1. **⚠️ Download CloudBase Templates (MANDATORY for New Projects)**: 
   - **MUST call \`downloadTemplate\` tool FIRST when starting a new project** - Do NOT manually create project files
   - For Web projects: Use \`downloadTemplate\` with \`template="react"\` or \`template="vue"\`
   - For Mini Program projects: Use \`downloadTemplate\` with \`template="miniprogram"\`
   - For UniApp projects: Use \`downloadTemplate\` with \`template="uniapp"\`
   - **Only proceed with manual file creation if template download fails or user explicitly requests manual creation**
   - If unable to download to current directory, can use scripts to copy, note that hidden files also need to be copied

2. **⚠️ UI Design Document Reading (MANDATORY)**: 
   - **Before generating ANY page, interface, component, or style, MUST FIRST explicitly read the file \`rules/ui-design/rule.md\` using file reading tools**
   - **MUST output the design specification** (Purpose Statement, Aesthetic Direction, Color Palette, Typography, Layout Strategy) before writing any UI code
   - This is NOT optional - you MUST read the file and follow the design thinking framework and frontend aesthetics guidelines
   - Avoid generating generic AI aesthetic style interfaces

3. **Mini Program TabBar Material Download - Download Remote Material Links**: Mini program Tabbar and other material images must use **png** format, must use downloadRemoteFile tool to download files locally. Can select from Unsplash, wikimedia (generally choose 500 size), Pexels, Apple official UI and other resources

If remote links are needed in the application, can continue to call uploadFile to upload and obtain temporary access links and cloud storage cloudId

3. **Query Professional Knowledge from Knowledge Base**: If uncertain about any CloudBase knowledge, can use searchKnowledgeBase tool to intelligently search CloudBase knowledge base (supports CloudBase and cloud functions, mini program frontend knowledge, etc.), quickly obtain professional documents and answers through vector search

4. **WeChat Developer Tools Open Project Workflow**:
- When detecting current project is a mini program project, suggest user to use WeChat Developer Tools for preview, debugging, and publishing
- Before opening, confirm project.config.json has appid field configured. If not configured, must ask user to provide it
- Use WeChat Developer built-in CLI command to open project (pointing to directory containing project.config.json):
  - Windows: \`"C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat" open --project "项目根目录路径"\`
  - macOS: \`/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project "/path/to/project/root"\`
- Project root directory path is the directory containing project.config.json file

### Deployment Process

1. **Cloud Function Deployment Process**: Prefer \`queryFunctions\` to query current functions, then call \`manageFunctions\` with \`action="createFunction"\` or \`action="updateFunctionCode"\` to deploy cloud function code. Only need to point \`functionRootPath\` to the parent directory of the cloud function directory (for example, the absolute path of the \`cloudfunctions\` directory). No need for code compression or other preprocessing.

2. **CloudRun Deployment Process**: For non-cloud function backend services (Java, Go, PHP, Python, Node.js, etc.), use manageCloudRun tool for deployment. Ensure backend code supports CORS, prepare Dockerfile, then call manageCloudRun for containerized deployment. For details, refer to \`rules/cloudrun-development/rule.md\`

3. **Static Hosting Deployment Process**: Deploy using uploadFiles tool. After deployment, remind users that CDN has a few minutes of cache. Can generate markdown format access links with random queryString. For details, refer to \`rules/web-development/rule.md\`

### Documentation Generation Rules

1. You will generate a README.md file after generating the project, containing basic project information, such as project name, project description. Most importantly, clearly explain the project architecture and involved CloudBase resources, so maintainers can refer to it for modification and maintenance
2. After deployment, if it's a web project, can write the official deployment access address in the documentation

### Configuration File Rules

1. To help others who don't use AI understand what resources are available, can generate a cloudbaserc.json file after generation

### MCP Interface Call Rules
When calling MCP services, you need to fully understand the data types of all interfaces to be called, as well as return value types. If you're not sure which interface to call, first check the documentation and tool descriptions, then determine which interface and parameters to call based on the documentation and tool descriptions. Do not have incorrect method parameters or parameter type errors.

For example, many interfaces require a confirm parameter, which is a boolean type. If you don't provide this parameter, or provide incorrect data type, the interface will return an error.

### Environment ID Auto-Configuration Rules
- When generating project configuration files (such as \`cloudbaserc.json\`, \`project.config.json\`, etc.), automatically use the environment ID queried by \`envQuery\`
- In code examples involving environment ID, automatically fill in current environment ID, no need for manual user replacement
- In deployment and preview related operations, prioritize using already queried environment information

## Professional Rule File Reference

**Note**: For detailed information, refer to the specific skill files. This section provides quick reference only.

### Platform Development Skills
- **Web**: \`rules/web-development/rule.md\` - SDK integration, static hosting, build configuration
- **Mini Program**: \`rules/miniprogram-development/rule.md\` - Project structure, WeChat Developer Tools, wx.cloud
- **CloudRun**: \`rules/cloudrun-development/rule.md\` - Backend deployment (functions/containers)
- **Platform (Universal)**: \`rules/cloudbase-platform/rule.md\` - Environment, authentication, services

### Authentication Skills
- **Web**: \`rules/auth-web/rule.md\` - **MUST use Web SDK built-in authentication**
- **Mini Program**: \`rules/auth-wechat/rule.md\` - **Naturally login-free, get OPENID in cloud functions**
- **Node.js**: \`rules/auth-nodejs/rule.md\`
- **HTTP API**: \`rules/auth-http-api/rule.md\`

### Database Skills
- **NoSQL (Web)**: \`rules/no-sql-web-sdk/rule.md\`
- **NoSQL (Mini Program)**: \`rules/no-sql-wx-mp-sdk/rule.md\`
- **MySQL (Web)**: \`rules/relational-database-web/rule.md\`
- **MySQL (MCP)**: \`rules/relational-database-mcp/rule.md\`
- **Data Model Creation**: \`rules/data-model-creation/rule.md\`

### 🎨 ⚠️ UI Design Skill (CRITICAL - Read FIRST)
- **\`rules/ui-design/rule.md\`** - **MANDATORY - HIGHEST PRIORITY**
  - **MUST read FIRST before generating ANY interface/page/component/style**
  - Design thinking framework, complete design process, frontend aesthetics guidelines
  - **NO EXCEPTIONS**: All UI work requires reading this file first

### Workflow Skills
- **Spec Workflow**: \`rules/spec-workflow/rule.md\` - Standard software engineering process (requirements, design, tasks)

## Development Quality Checklist

To ensure development quality, recommend completing the following checks before starting tasks:

### Recommended Steps
0. **[ ] Environment Check**: Call \`envQuery\` tool to check CloudBase environment status (applies to all interactions)
1. **[ ] Template Download Check (MANDATORY for New Projects)**: If starting a new project, have you called \`downloadTemplate\` tool FIRST? Do NOT manually create project files - use templates.
2. **[ ] Scenario Identification**: Clearly identify what type of project this is (Web/Mini Program/Database/UI)
3. **[ ] Core Capability Confirmation**: Confirm all four core capabilities have been considered
   - UI Design: Have you explicitly read the file \`rules/ui-design/rule.md\` using file reading tools?
   - Database + Authentication: Have you referred to corresponding authentication and database skills?
   - Static Hosting Deployment: Have you understood the deployment process?
   - Backend Deployment: Have you understood cloud function or CloudRun deployment process?
4. **[ ] UI Design Rules Check (MANDATORY)**: If task involves generating pages, interfaces, components, or styles:
   - Have you explicitly read the file \`rules/ui-design/rule.md\` using file reading tools? (Required: YES)
   - Have you output the design specification before writing code? (Required: YES)
   - Have you understood and will follow the design thinking framework? (Required: YES)
5. **[ ] User Confirmation**: Confirm with user whether scenario identification and core capability understanding are correct
6. **[ ] Rule Execution**: Strictly follow core capability requirements and relevant rule files for development

### ⚠️ Common Issues to Avoid
- **❌ DO NOT manually create project files** - Always use \`downloadTemplate\` tool first for new projects
- **❌ DO NOT skip reading UI design document** - Must explicitly read \`rules/ui-design/rule.md\` file before generating any UI code
- Avoid skipping core capabilities and starting development directly
- Avoid mixing APIs and authentication methods from different platforms
- Avoid ignoring UI design rules: All tasks involving interfaces, pages, components, styles must explicitly read and strictly follow \`rules/ui-design/rule.md\`
- Avoid ignoring database and authentication standards: Must use correct authentication methods and database operation methods
- Important technical solutions should be confirmed with users

### Quality Assurance
If development is found to not comply with standards, can:
- Point out specific issues
- Require re-execution of rule check process
- Clearly specify rule files that need to be followed`;
