#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadYamlModule } from './lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT_DIR, 'config', 'source', 'skills');
const PROMPTS_DIR = path.join(ROOT_DIR, 'doc/prompts');
const CONFIG_FILE = path.join(PROMPTS_DIR, 'config.yaml');
const SIDEBAR_FILE = path.join(ROOT_DIR, 'doc/sidebar.json');
const yaml = await loadYamlModule(ROOT_DIR);

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, content: content.trim() };
  }
  
  const frontmatterText = match[1];
  const body = match[2];
  
  // Parse YAML frontmatter
  let frontmatter = {};
  try {
    frontmatter = yaml.load(frontmatterText) || {};
  } catch (e) {
    console.warn(`Warning: Failed to parse frontmatter: ${e.message}`);
  }
  
  return { frontmatter, content: body.trim() };
}

/**
 * Read all markdown files from a directory
 */
async function readSkillFiles(skillDir) {
  const files = fs.readdirSync(skillDir)
    .filter(file => file.endsWith('.md'))
    .sort((a, b) => {
      // Put SKILL.md first if it exists
      if (a === 'SKILL.md') return -1;
      if (b === 'SKILL.md') return 1;
      return a.localeCompare(b);
    });
  
  const fileContents = [];
  
  for (const file of files) {
    const filePath = path.join(skillDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, content: body } = parseFrontmatter(content);
    
    fileContents.push({
      filename: file,
      frontmatter,
      content: body,
    });
  }
  
  return fileContents;
}

const FULL_INSTALL_COMMAND = 'npx skills add tencentcloudbase/cloudbase-skills';
const SINGLE_INSTALL_REPO = 'https://github.com/tencentcloudbase/skills';
const SKILL_VIEW_BASE_URL = 'https://skills.sh/tencentcloudbase/skills';

/**
 * Extract the `name` field from SKILL.md frontmatter
 */
function getSkillNameFromFiles(files) {
  const skillFile = files.find(f => f.filename === 'SKILL.md');
  if (!skillFile) return null;
  
  // Use already-parsed frontmatter
  if (skillFile.frontmatter && skillFile.frontmatter.name) {
    return skillFile.frontmatter.name;
  }
  
  return null;
}

/**
 * Count the max consecutive backticks in text to determine fence length
 */
function maxBacktickRun(text) {
  let max = 0, cur = 0;
  for (const ch of text) {
    if (ch === '`') { cur++; max = Math.max(max, cur); }
    else { cur = 0; }
  }
  return max;
}

/**
 * Generate MDX content for a single rule
 */
function generateMDX(ruleConfig, files) {
  const { id, title, description, prompts = [], ruleDir } = ruleConfig;
  const skillId = ruleDir || id;
  const singleInstallCommand = `npx skills add ${SINGLE_INSTALL_REPO} --skill ${skillId}`;
  const skillName = getSkillNameFromFiles(files) || skillId;
  const skillViewUrl = `${SKILL_VIEW_BASE_URL}/${skillName}`;
  
  let mdx = `# ${title}\n\n${description}\n\n`;
  
  // How to use section - just a brief note with link
  mdx += `## 如何使用\n\n`;
  mdx += `查看[如何使用Skill](/ai/cloudbase-ai-toolkit/prompts/how-to-use)了解详细的使用方法。\n\n`;
  
  // Test prompts section
  if (prompts.length > 0) {
    mdx += `### 测试 Skill\n\n`;
    mdx += `你可以使用以下提示词来测试：\n\n`;
    for (const prompt of prompts) {
      mdx += `- "${prompt}"\n`;
    }
    mdx += `\n`;
  }
  
  // Add AIDevelopmentPrompt component
  mdx += `import AIDevelopmentPrompt from '../components/AIDevelopmentPrompt';\n\n`;
  mdx += `<AIDevelopmentPrompt ruleId="${id}" />\n\n`;
  
  mdx += `## 安装与查看\n\n`;
  mdx += `如果需要安装全部 CloudBase Skills，可执行：\n\n`;
  mdx += `\`\`\`bash\n${FULL_INSTALL_COMMAND}\n\`\`\`\n\n`;
  mdx += `如果只安装当前 Skill，可执行：\n\n`;
  mdx += `\`\`\`bash\n${singleInstallCommand}\n\`\`\`\n\n`;
  mdx += `当前 Skill 在线查看： [${skillId}](${skillViewUrl})\n`;

  // Embed SKILL.md original content at the very bottom for SEO
  const skillFile = files.find(f => f.filename === 'SKILL.md');
  if (skillFile && skillFile.content) {
    mdx += `\n---\n\n`;
    mdx += `## Skill 规则原文\n\n`;
    mdx += `<details>\n<summary>查看 SKILL.md 原文</summary>\n\n`;
    const fenceLen = Math.max(4, maxBacktickRun(skillFile.content) + 1);
    const fence = '`'.repeat(fenceLen);
    mdx += `${fence}markdown\n${skillFile.content}\n${fence}\n\n`;
    mdx += `</details>\n`;
  }
  
  return mdx;
}

/**
 * Update sidebar.json with prompts entries grouped by category
 */
function updateSidebar(config) {
  if (!fs.existsSync(SIDEBAR_FILE)) {
    console.warn(`Warning: Sidebar file not found: ${SIDEBAR_FILE}`);
    return;
  }
  
  // Read sidebar JSON file
  const sidebarContent = fs.readFileSync(SIDEBAR_FILE, 'utf8');
  let sidebar = JSON.parse(sidebarContent);
  
  // Get categories from config
  const categories = (config.categories || []).sort((a, b) => (a.order || 999) - (b.order || 999));
  
  // Group rules by category
  const rulesByCategory = {};
  for (const rule of config.rules) {
    const mdxFile = path.join(PROMPTS_DIR, `${rule.id}.mdx`);
    if (!fs.existsSync(mdxFile)) {
      continue;
    }
    
    const categoryId = rule.category || 'other';
    if (!rulesByCategory[categoryId]) {
      rulesByCategory[categoryId] = [];
    }
    rulesByCategory[categoryId].push(rule);
  }
  
  // Sort rules within each category
  for (const categoryId in rulesByCategory) {
    rulesByCategory[categoryId].sort((a, b) => (a.order || 999) - (b.order || 999));
  }
  
  // Build category items
  const categoryItems = categories.map(category => {
    const rules = rulesByCategory[category.id] || [];
    const items = rules.map(rule => `ai/cloudbase-ai-toolkit/prompts/${rule.id}`);
    
    return {
      type: 'category',
      label: category.label,
      collapsible: true,
      collapsed: true,
      items: items
    };
  });
  
  // Add uncategorized rules if any
  const uncategorizedRules = rulesByCategory['other'] || [];
  if (uncategorizedRules.length > 0) {
    const items = uncategorizedRules
      .sort((a, b) => (a.order || 999) - (b.order || 999))
      .map(rule => `ai/cloudbase-ai-toolkit/prompts/${rule.id}`);
    
    categoryItems.push({
      type: 'category',
      label: '其他',
      collapsible: true,
      collapsed: true,
      items: items
    });
  }
  
  // Find the main category - try multiple possible labels
  const mainCategory = sidebar.find(item => 
    item.label === 'CloudBase AI Toolkit' || 
    item.label === 'AI 原生开发' ||
    (item.type === 'category' && item.items && item.items.length > 0)
  );
  if (!mainCategory || !mainCategory.items) {
    console.warn('Warning: Could not find main category in sidebar.json');
    return;
  }
  
  // Create prompts category with subcategories
  // Add "How to use" document at the beginning
  const howToUseItem = 'ai/cloudbase-ai-toolkit/prompts/how-to-use';
  const promptsCategoryItems = [howToUseItem, ...categoryItems];
  const promptsCategory = {
    type: 'category',
    label: 'AI Skill',
    collapsible: true,
    collapsed: true,
    items: promptsCategoryItems
  };
  
  // Find or update prompts category
  let promptsCategoryIndex = mainCategory.items.findIndex(
    item => item.type === 'category' && (item.label === '提示词' || item.label === 'AI 提示词' || item.label === 'AI Skill')
  );
  
  if (promptsCategoryIndex >= 0) {
    // Update existing prompts category
    mainCategory.items[promptsCategoryIndex] = promptsCategory;
  } else {
    // Find the position after "MCP" category and before "教程" category
    const tutorialIndex = mainCategory.items.findIndex(
      item => item.type === 'category' && item.label === '教程'
    );
    
    if (tutorialIndex >= 0) {
      mainCategory.items.splice(tutorialIndex, 0, promptsCategory);
    } else {
      // Insert before FAQ
      const faqIndex = mainCategory.items.findIndex(
        item => typeof item === 'string' && item.includes('faq')
      );
      if (faqIndex >= 0) {
        mainCategory.items.splice(faqIndex, 0, promptsCategory);
      } else {
        // Append to the end
        mainCategory.items.push(promptsCategory);
      }
    }
  }
  
  // Write back as formatted JSON
  fs.writeFileSync(SIDEBAR_FILE, JSON.stringify(sidebar, null, 2) + '\n', 'utf8');
  console.log(`Updated: ${SIDEBAR_FILE}`);
}

/**
 * Main function
 */
async function main() {
  // Read config
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Config file not found: ${CONFIG_FILE}`);
    process.exit(1);
  }
  
  const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
  const config = yaml.load(configContent);
  
  if (!config.rules || !Array.isArray(config.rules)) {
    console.error('Invalid config: rules array not found');
    process.exit(1);
  }
  
  // Ensure prompts directory exists
  if (!fs.existsSync(PROMPTS_DIR)) {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  }
  
  // Process each rule
  for (const ruleConfig of config.rules) {
    const { id, ruleDir } = ruleConfig;
    const actualSkillDir = path.join(SKILLS_DIR, ruleDir || id);
    
    if (!fs.existsSync(actualSkillDir)) {
      console.warn(`Warning: Skill directory not found: ${actualSkillDir}`);
      continue;
    }
    
    // Read all markdown files
    const files = await readSkillFiles(actualSkillDir);
    
    if (files.length === 0) {
      console.warn(`Warning: No markdown files found in ${actualSkillDir}`);
      continue;
    }
    
    // Generate MDX content
    const mdxContent = generateMDX(ruleConfig, files);
    
    // Write to file
    const outputFile = path.join(PROMPTS_DIR, `${id}.mdx`);
    fs.writeFileSync(outputFile, mdxContent, 'utf8');
    
    console.log(`Generated: ${outputFile}`);
  }
  
  // Update sidebar
  updateSidebar(config);
  
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
