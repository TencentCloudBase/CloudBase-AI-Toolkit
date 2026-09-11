#!/usr/bin/env node

/**
 * 配置同步脚本 - sync-config.mjs
 * 
 * 功能说明：
 * 将当前项目的 config 目录下的配置文件和规则同步到 cloudbase-examples 仓库中的各个模板项目。
 * 主要用于保持示例模板项目与主项目配置的一致性。
 * 
 * 主要用途：
 * - 同步 AI IDE 配置文件（如 .mcp.json、CLAUDE.md、CODEBUDDY.md 等）
 * - 同步规则文件（rules 目录）
 * - 同步其他配置文件到各个模板项目
 * 
 * 工作流程：
 * 1. 读取 scripts/template-config.json 获取模板列表
 * 2. 遍历每个模板，将 config 目录内容复制到对应模板目录
 * 3. 差集清理：删除目标端各 skills/ 目录下源中已不存在的 skill 子目录（僵尸 skill）
 * 4. 同步后断言：目标端 skill 集合必须等于源端应有集合，否则非零退出并阻断 Git 操作
 * 5. 根据配置决定是否执行 Git 提交和推送操作
 * 
 * 使用方式：
 *   node scripts/sync-config.mjs                     # 同步所有模板
 *   node scripts/sync-config.mjs --dry-run           # 干运行模式（预览）
 *   node scripts/sync-config.mjs --filter web        # 只同步包含"web"的模板
 *   node scripts/sync-config.mjs --skip-git          # 跳过Git操作
 *   node scripts/sync-config.mjs --backup            # 创建备份
 * 
 * 配置文件：
 *   scripts/template-config.json - 定义要同步的模板列表和配置选项
 * 
 * 目标目录：
 *   ../cloudbase-examples/{template-path}/ - 各个模板项目的路径
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCompatConfig } from './build-compat-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录
const projectRoot = path.resolve(__dirname, '..');
const configDir = path.join(projectRoot, '.generated', 'compat-config');
const templateConfigPath = path.join(__dirname, 'template-config.json');

// 获取 cloudbase-examples 路径（支持环境变量，用于 CI 环境）
const getCloudbaseExamplesPath = () => {
  const envPath = process.env.CLOUDBASE_EXAMPLES_PATH;
  if (envPath) {
    // 如果是相对路径，相对于项目根目录；如果是绝对路径，直接使用
    return path.isAbsolute(envPath) ? envPath : path.resolve(projectRoot, envPath);
  }
  // 默认路径：项目根目录的上级目录下的 cloudbase-examples
  return path.join(projectRoot, '..', 'cloudbase-examples');
};

// 读取模板配置
let templateConfig;
try {
  const configContent = fs.readFileSync(templateConfigPath, 'utf8');
  templateConfig = JSON.parse(configContent);
} catch (error) {
  console.error('❌ 无法读取模板配置文件:', error.message);
  process.exit(1);
}

// Skills 分类：各平台专属 skill 目录名
const WEB_ONLY_SKILLS = new Set([
  'web-development',
  'auth-web-cloudbase',
  'ai-model-web',
  'cloud-storage-web',
  'cloudbase-document-database-web-sdk',
  'relational-database-web-cloudbase',
  'http-api-cloudbase',
]);

const MINIPROGRAM_ONLY_SKILLS = new Set([
  'miniprogram-development',
  'auth-wechat-miniprogram',
  'ai-model-wechat',
  'cloudbase-document-database-in-wechat-miniprogram',
]);

/**
 * 根据模板类型推断需要排除的 skill 集合
 * @param {string} templateType 'web' | 'miniprogram' | undefined
 * @returns {Set<string>}
 */
function getExcludedSkills(templateType) {
  if (templateType === 'web') return MINIPROGRAM_ONLY_SKILLS;
  if (templateType === 'miniprogram') return WEB_ONLY_SKILLS;
  return new Set();
}

/**
 * 检查给定路径是否对应被排除的 skill
 * skill 目录/文件出现在以下位置：
 *   rules/{skill-name}/
 *   .cursor/rules/{skill-name}.mdc
 *   .codebuddy/skills/{skill-name}/
 *   .claude/skills/{skill-name}/
 *   .{ide}/rules/{skill-name}.md(c)
 *   .clinerules/{skill-name}/       — 扁平目录，skill 直接在 .clinerules 下
 *   .kiro/steering/{skill-name}/
 * @param {string} relPath  相对于 configDir 的路径（使用 / 分隔）
 * @param {Set<string>} excludedSkills
 * @returns {boolean}
 */
function isExcludedSkill(relPath, excludedSkills) {
  if (excludedSkills.size === 0) return false;
  const parts = relPath.split('/');
  // rules/{skill-name} or rules/{skill-name}/...
  if (parts[0] === 'rules' && parts.length >= 2) {
    return excludedSkills.has(parts[1]);
  }
  // .codebuddy/skills/{skill-name} or .claude/skills/{skill-name}
  if ((parts[0] === '.codebuddy' || parts[0] === '.claude') && parts[1] === 'skills' && parts.length >= 3) {
    return excludedSkills.has(parts[2]);
  }
  // .clinerules/{skill-name} — skill 目录直接在 .clinerules 下
  if (parts[0] === '.clinerules' && parts.length >= 2) {
    const name = parts[1].replace(/\.mdx?c?$/, '');
    return excludedSkills.has(name);
  }
  // .kiro/steering/{skill-name}
  if (parts[0] === '.kiro' && parts[1] === 'steering' && parts.length >= 3) {
    const name = parts[2].replace(/\.mdx?c?$/, '');
    return excludedSkills.has(name);
  }
  // .{ide}/rules/{skill-name}.md(c) — flat file under any IDE rules dir
  if (parts.length >= 3 && parts[parts.length - 2] === 'rules') {
    const fileName = parts[parts.length - 1].replace(/\.mdx?c?$/, '');
    return excludedSkills.has(fileName);
  }
  return false;
}

/**
 * 复制目录内容
 * @param {string} srcDir 源目录
 * @param {string} destDir 目标目录
 * @param {Array} excludePatterns 排除模式
 * @param {Array} includePatterns 包含模式（可选）
 * @param {Set<string>} excludedSkills 需要过滤的 skill 名称集合（可选）
 */
function copyDirectory(srcDir, destDir, excludePatterns = [], includePatterns = null, excludedSkills = new Set()) {
  try {
    // 确保目标目录存在
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const items = fs.readdirSync(srcDir);
    
    for (const item of items) {
      // 检查是否需要排除
      if (excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(item);
        }
        return item === pattern;
      })) {
        console.log(`  ⏭️  跳过: ${item} (匹配排除规则)`);
        continue;
      }

      const srcPath = path.join(srcDir, item);
      const destPath = path.join(destDir, item);
      
      // 检查是否为被排除的 skill
      if (excludedSkills.size > 0) {
        const relPath = path.relative(configDir, srcPath).split(path.sep).join('/');
        if (isExcludedSkill(relPath, excludedSkills)) {
          console.log(`  ⏭️  跳过 skill: ${relPath} (平台不匹配)`);
          continue;
        }
      }

      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        // 如果有包含模式，检查当前目录是否在包含列表中
        if (includePatterns) {
          const relativePath = path.relative(configDir, srcPath);
          const isIncluded = includePatterns.some(pattern => {
            // 检查是否完全匹配或作为前缀匹配
            return relativePath === pattern || relativePath.startsWith(pattern + '/');
          });
          
          if (!isIncluded) {
            console.log(`  ⏭️  跳过目录: ${item} (不在包含列表中)`);
            continue;
          }
        }
        
        copyDirectory(srcPath, destPath, excludePatterns, includePatterns, excludedSkills);
      } else {
        // 如果有包含模式，检查当前文件是否在包含列表中
        if (includePatterns) {
          const relativePath = path.relative(configDir, srcPath);
          const isIncluded = includePatterns.some(pattern => {
            // 检查是否完全匹配或作为前缀匹配
            return relativePath === pattern || relativePath.startsWith(pattern + '/');
          });
          
          if (!isIncluded) {
            console.log(`  ⏭️  跳过文件: ${item} (不在包含列表中)`);
            continue;
          }
        }
        
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ 已复制: ${path.relative(projectRoot, destPath)}`);
      }
    }
  } catch (error) {
    console.error(`复制目录失败: ${srcDir} -> ${destDir}`, error.message);
  }
}

/**
 * 检查目标路径是否存在
 * @param {string} targetPath 目标路径
 * @returns {boolean}
 */
function checkTargetExists(targetPath) {
  return fs.existsSync(targetPath);
}

/**
 * 执行Git命令
 * @param {string} command Git命令
 * @param {string} cwd 工作目录
 */
function executeGitCommand(command, cwd = projectRoot) {
  try {
    const result = execSync(command, { 
      cwd, 
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (error) {
    console.error(`Git命令执行失败: ${command}`);
    console.error(error.message);
    throw error;
  }
}

/**
 * 获取当前Git分支
 */
function getCurrentBranch(cwd = projectRoot) {
  try {
    return executeGitCommand('git rev-parse --abbrev-ref HEAD', cwd);
  } catch (error) {
    return 'main'; // 默认分支
  }
}

/**
 * 检查是否有未提交的更改
 */
function hasUncommittedChanges(cwd = projectRoot) {
  try {
    const status = executeGitCommand('git status --porcelain', cwd);
    return status.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * 创建备份
 * @param {string} targetDir 目标目录
 */
function createBackup(targetDir) {
  if (!fs.existsSync(targetDir)) return null;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `${targetDir}.backup.${timestamp}`;
  
  try {
    fs.cpSync(targetDir, backupDir, { recursive: true });
    console.log(`  💾 已创建备份: ${path.basename(backupDir)}`);
    return backupDir;
  } catch (error) {
    console.error(`创建备份失败:`, error.message);
    return null;
  }
}

// 承载 skill 的目录名。差集清理只在这个名字的目录里做删除，绝不触碰其父目录。
const SKILLS_DIR_NAME = 'skills';

/**
 * 转为 posix 风格路径，便于与 includePatterns 比较
 * @param {string} filePath
 * @returns {string}
 */
function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * 判断 candidate 是否等于 parent 或位于 parent 内部（两边都会规范化）
 * @param {string} parent
 * @param {string} candidate
 * @returns {boolean}
 */
function isSamePathOrWithin(parent, candidate) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 删除/写入前的越界保护：路径必须严格落在 root 内
 * @param {string} root
 * @param {string} candidate
 * @param {string} label 出错时用于定位的描述
 */
function assertWithin(root, candidate, label) {
  if (!isSamePathOrWithin(root, candidate)) {
    throw new Error(`拒绝操作越界路径: ${label} (${candidate}) 不在 ${root} 内`);
  }
}

/**
 * 判断相对路径是否被 includePatterns 覆盖（与 copyDirectory 的判定保持一致）
 * @param {string} relPosixPath 相对 configDir 的 posix 路径
 * @param {Array<string>|null} includePatterns
 * @returns {boolean}
 */
function isPathIncluded(relPosixPath, includePatterns = null) {
  if (!includePatterns) return true;
  return includePatterns.some(
    pattern => relPosixPath === pattern || relPosixPath.startsWith(`${pattern}/`),
  );
}

/**
 * 递归找出源目录下所有名为 skills 的目录。
 * 只跟随真实目录（Dirent.isDirectory() 对符号链接返回 false），跳过 .git/node_modules。
 * @param {string} rootDir
 * @returns {Array<string>} 绝对路径，已排序
 */
function findSkillsDirectories(rootDir) {
  const found = [];

  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;

      const childPath = path.join(dir, entry.name);
      if (entry.name === SKILLS_DIR_NAME) {
        found.push(childPath);
        continue; // skills 目录下不会再嵌套 skills
      }
      walk(childPath);
    }
  };

  walk(rootDir);
  return found.sort();
}

/**
 * 计算同步后目标端每个 skills 目录应有的 skill 集合。
 *
 * 关键点：对每个 skill 复用 copyDirectory 使用的 isExcludedSkill 判定，
 * 因此"期望集合"天然与复制逻辑一致（被平台过滤的 skill 既不算缺失、也不会被误删）。
 *
 * @param {string} srcRoot 源根目录（这里是 .generated/compat-config）
 * @param {Object} [options]
 * @param {Array<string>|null} [options.includePatterns] 模板的包含模式
 * @param {Set<string>} [options.excludedSkills] 平台需要过滤的 skill 集合
 * @returns {Map<string, Set<string>>} key 为相对 srcRoot 的 posix 路径（如 ".claude/skills"）
 */
export function collectExpectedSkills(srcRoot, options = {}) {
  const { includePatterns = null, excludedSkills = new Set() } = options;
  const expected = new Map();

  for (const skillsDir of findSkillsDirectories(srcRoot)) {
    const relSkillsDir = toPosixPath(path.relative(srcRoot, skillsDir));
    if (!isPathIncluded(relSkillsDir, includePatterns)) continue;

    const skillNames = new Set();
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relPath = `${relSkillsDir}/${entry.name}`;
      if (isExcludedSkill(relPath, excludedSkills)) continue;
      skillNames.add(entry.name);
    }

    expected.set(relSkillsDir, skillNames);
  }

  return expected;
}

/**
 * 差集清理：只删除目标端各 skills 目录下"源中不存在"的 skill 子目录。
 *
 * 安全约束：
 * - 只遍历由源端派生的 skills 目录（目录名必须严格等于 skills）
 * - 只删除目录，文件/符号链接一律跳过（Dirent.isDirectory() 不跟随符号链接）
 * - 每次删除前做路径规范化 + 前缀校验，确保路径落在 targetDir 内
 *
 * @param {string} targetDir 模板目标目录
 * @param {Map<string, Set<string>>} expectedBySkillsDir collectExpectedSkills 的返回值
 * @param {Object} [options]
 * @param {boolean} [options.dryRun] 干运行：只打印不删除
 * @param {(message: string) => void} [options.log]
 * @returns {Array<{relPath: string, skill: string}>} 已删除（dry-run 下为将被删除）的条目
 */
export function cleanStaleSkills(targetDir, expectedBySkillsDir, options = {}) {
  const { dryRun = false, log = console.log } = options;
  const removed = [];

  for (const [relSkillsDir, expectedNames] of expectedBySkillsDir) {
    if (path.basename(relSkillsDir) !== SKILLS_DIR_NAME) {
      throw new Error(`拒绝清理非 skills 目录: ${relSkillsDir}`);
    }

    const skillsDir = path.resolve(targetDir, relSkillsDir);
    assertWithin(targetDir, skillsDir, relSkillsDir);
    if (!fs.existsSync(skillsDir)) continue;

    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue; // 文件 / 符号链接不碰
      if (expectedNames.has(entry.name)) continue;

      const entryPath = path.resolve(skillsDir, entry.name);
      assertWithin(skillsDir, entryPath, relSkillsDir);

      const relPath = `${relSkillsDir}/${entry.name}`;
      removed.push({ relPath, skill: entry.name });

      if (dryRun) {
        log(`    🔍 [干运行] 将删除废弃 skill: ${relPath}`);
      } else {
        fs.rmSync(entryPath, { recursive: true, force: true });
        log(`    🗑️  已删除废弃 skill: ${relPath}`);
      }
    }
  }

  return removed;
}

/**
 * 同步后断言：目标端每个 skills 目录的 skill 集合必须等于源端应有的集合。
 * @param {string} targetDir 模板目标目录
 * @param {Map<string, Set<string>>} expectedBySkillsDir collectExpectedSkills 的返回值
 * @returns {{ok: boolean, issues: Array<{relSkillsDir: string, missing: Array<string>, unexpected: Array<string>}>}}
 */
export function assertSkillsInSync(targetDir, expectedBySkillsDir) {
  const issues = [];

  for (const [relSkillsDir, expectedNames] of expectedBySkillsDir) {
    const skillsDir = path.resolve(targetDir, relSkillsDir);
    assertWithin(targetDir, skillsDir, relSkillsDir);

    const actual = new Set();
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) actual.add(entry.name);
      }
    }

    const missing = [...expectedNames].filter(name => !actual.has(name)).sort();
    const unexpected = [...actual].filter(name => !expectedNames.has(name)).sort();
    if (missing.length > 0 || unexpected.length > 0) {
      issues.push({ relSkillsDir, missing, unexpected });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * 把断言差异格式化成可读文本
 * @param {Array<{relSkillsDir: string, missing: Array<string>, unexpected: Array<string>}>} issues
 * @returns {string}
 */
export function formatSkillSyncIssues(issues) {
  return issues
    .map(({ relSkillsDir, missing, unexpected }) => {
      const lines = [`  ❌ ${relSkillsDir} 与源端不一致`];
      if (missing.length > 0) lines.push(`     缺少: ${missing.join(', ')}`);
      if (unexpected.length > 0) lines.push(`     残留: ${unexpected.join(', ')}`);
      return lines.join('\n');
    })
    .join('\n');
}

/**
 * 主同步函数
 */
async function syncConfigs(options = {}) {
  const {
    filter = null,     // 过滤器，支持字符串匹配
    dryRun = false,    // 干运行模式
    skipGit = false,   // 跳过Git操作
    createBackup: shouldBackup = templateConfig.syncConfig?.createBackup || false
  } = options;

  console.log('🚀 开始同步配置和规则到模板项目...\n');

  const compatResult = buildCompatConfig();
  console.log(`🧱 已生成兼容配置目录: ${compatResult.outputDir}`);
  console.log(`📦 兼容技能数量: ${compatResult.skillCount}`);
  
  // 检查config目录是否存在
  if (!fs.existsSync(configDir)) {
    console.error('❌ config目录不存在，请确保项目结构正确');
    process.exit(1);
  }
  
  console.log(`📁 配置源目录: ${configDir}`);
  
  // 获取要同步的模板路径
  let templateConfigs = templateConfig.templates;
  
  if (filter) {
    templateConfigs = templateConfigs.filter(config => {
      const path = typeof config === 'string' ? config : config.path;
      return path.includes(filter);
    });
    console.log(`🔍 过滤条件: 包含 "${filter}"`);
  }
  
  console.log(`📋 共需要同步 ${templateConfigs.length} 个模板`);
  console.log(`🔧 模式: ${dryRun ? '干运行' : '实际执行'}\n`);
  
  let successCount = 0;
  let skipCount = 0;
  const assertionFailures = [];
  
  // 遍历模板列表
  for (let i = 0; i < templateConfigs.length; i++) {
    const templateConfig = templateConfigs[i];
    const templatePath = typeof templateConfig === 'string' ? templateConfig : templateConfig.path;
    const includePatterns = typeof templateConfig === 'object' ? templateConfig.includePatterns : null;
    // 推断模板类型：优先使用显式 type 字段，否则从路径前缀推断
    const templateType = (typeof templateConfig === 'object' && templateConfig.type)
      || (templatePath.startsWith('web/') ? 'web' : templatePath.startsWith('miniprogram/') ? 'miniprogram' : null);
    const excludedSkills = getExcludedSkills(templateType);

    // 源端该模板应有的 skill 集合（按 skills 目录分组），用于差集清理与同步后断言
    const expectedBySkillsDir = collectExpectedSkills(configDir, {
      includePatterns,
      excludedSkills,
    });
    
    console.log(`\n[${i + 1}/${templateConfigs.length}] 处理模板: ${templatePath}${templateType ? ` [${templateType}]` : ''}`);
    if (includePatterns) {
      console.log(`  📁 包含模式: ${includePatterns.join(', ')}`);
    }
    if (excludedSkills.size > 0) {
      console.log(`  🚫 过滤 skill: ${[...excludedSkills].join(', ')}`);
    }
    
    const cloudbaseExamplesPath = getCloudbaseExamplesPath();
    const targetDir = path.join(cloudbaseExamplesPath, templatePath);
    
    // 自动创建目标目录的父目录
    const targetParentDir = path.dirname(targetDir);
    if (!fs.existsSync(targetParentDir)) {
      console.log(`  📁 自动创建目录: ${path.relative(projectRoot, targetParentDir)}`);
      fs.mkdirSync(targetParentDir, { recursive: true });
    }
    
    if (dryRun) {
      console.log(`  🔍 [干运行] 将同步到: ${targetDir}`);
      // 只预览"源中不存在的 skill 子目录"，不实际删除
      const plannedDeletions = cleanStaleSkills(targetDir, expectedBySkillsDir, { dryRun: true });
      if (plannedDeletions.length === 0) {
        console.log(`  🔍 [干运行] 没有需要清理的废弃 skill`);
      }
      console.log(`  🔍 [干运行] 跳过同步后断言`);
      successCount++;
      continue;
    }
    
    // 创建备份
    if (shouldBackup) {
      createBackup(targetDir);
    }
    
    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 同步config目录下的所有内容
    if (includePatterns) {
      // 如果有包含模式，只同步指定的目录和文件
      console.log(`  📂 按包含模式同步...`);
      copyDirectory(configDir, targetDir, templateConfig.excludePatterns, includePatterns, excludedSkills);
    } else {
      // 如果没有包含模式，同步所有内容
      const configItems = fs.readdirSync(configDir);
      for (const configItem of configItems) {
        const srcPath = path.join(configDir, configItem);
        const destPath = path.join(targetDir, configItem);
        
        if (fs.statSync(srcPath).isDirectory()) {
          console.log(`  📂 同步目录: ${configItem}`);
          copyDirectory(srcPath, destPath, templateConfig.excludePatterns, null, excludedSkills);
        } else {
          console.log(`  📄 同步文件: ${configItem}`);
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    // 差集清理：删除目标端 skills/ 下源中已不存在的 skill 子目录
    const removedSkills = cleanStaleSkills(targetDir, expectedBySkillsDir);
    if (removedSkills.length > 0) {
      console.log(`  🧹 已清理 ${removedSkills.length} 个废弃 skill 目录`);
    }

    // 同步后断言：目标端 skill 集合必须与源端一致，不一致则记入 failures 并由 CI 拦截
    const { ok, issues } = assertSkillsInSync(targetDir, expectedBySkillsDir);
    if (!ok) {
      assertionFailures.push({ templatePath, issues });
      console.error(`  ❌ skill 集合校验失败:\n${formatSkillSyncIssues(issues)}`);
    }
    
    successCount++;
    console.log(`  ✅ 同步完成: ${templatePath}`);
  }
  
  console.log(`\n📊 同步统计:`);
  console.log(`  ✅ 成功同步: ${successCount} 个模板`);
  console.log(`  ⚠️  跳过: ${skipCount} 个模板`);

  // 断言失败必须阻断后续 Git 操作，避免把脏 skill 列表提交/发布出去
  if (assertionFailures.length > 0) {
    const summary = assertionFailures
      .map(({ templatePath, issues }) => `模板 ${templatePath}:\n${formatSkillSyncIssues(issues)}`)
      .join('\n');
    throw new Error(`❌ skill 同步校验未通过，已阻止 Git 操作：\n${summary}`);
  }
  
  // Git提交和推送
  if (!skipGit && !dryRun && templateConfig.syncConfig?.autoCommit) {
    await handleGitOperations();
  } else if (dryRun) {
    console.log('\n🔍 [干运行] 跳过Git操作');
  } else if (skipGit) {
    console.log('\n⏭️  已跳过Git操作');
  }
}

/**
 * 处理Git操作
 */
async function handleGitOperations() {
  console.log('\n🔄 开始Git操作...');
  
  const examplesDir = getCloudbaseExamplesPath();
  
  if (!fs.existsSync(examplesDir)) {
    console.log('⚠️  cloudbase-examples 目录不存在，跳过Git操作');
    console.log('请先克隆该仓库到上级目录：');
    console.log('git clone https://github.com/TencentCloudBase/awsome-cloudbase-examples.git cloudbase-examples');
    return;
  }
  
  try {
    // 检查Git状态
    if (!hasUncommittedChanges(examplesDir)) {
      console.log('📝 没有检测到更改，跳过提交');
      return;
    }
    
    const currentBranch = getCurrentBranch(examplesDir);
    console.log(`📍 当前分支: ${currentBranch}`);
    
    // 添加所有更改
    console.log('📝 添加更改到暂存区...');
    executeGitCommand('git add .', examplesDir);
    
    // 生成提交信息
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const commitMessage = templateConfig.syncConfig?.commitMessage || 
      `chore: sync config and rules from cloudbase-turbo-deploy ${timestamp}`;
    
    // 提交更改
    console.log('💾 提交更改...');
    execFileSync('git', ['commit', '-m', commitMessage], { cwd: examplesDir, encoding: 'utf8' });
    
    // 推送到远程仓库
    console.log('🚀 推送到远程仓库...');
    execFileSync('git', ['pull', '--rebase'], { cwd: examplesDir, encoding: 'utf8' });
    execFileSync('git', ['push', 'origin', currentBranch], { cwd: examplesDir, encoding: 'utf8' });
    
    console.log('✅ Git操作完成！');
    
  } catch (error) {
    console.error('❌ Git操作失败:', error.message);
    console.log('\n请手动检查并处理Git操作：');
    console.log('1. cd ../awesome-cloudbase-examples');
    console.log('2. git add .');
    console.log('3. git commit -m "sync config and rules"');
    console.log('4. git push');
  }
}

/**
 * 显示使用说明
 */
function showUsage() {
  console.log(`
📖 使用说明:

基本用法:
  node scripts/sync-config.mjs [选项]

选项:
  --help, -h              显示帮助信息
  --dry-run              干运行模式，不实际执行操作
  --skip-git             跳过Git提交和推送操作
  --backup               创建备份（覆盖配置文件设置）
  --filter <关键词>       只同步路径包含指定关键词的模板

示例:
  node scripts/sync-config.mjs                     # 同步所有模板
  node scripts/sync-config.mjs --dry-run           # 干运行模式
  node scripts/sync-config.mjs --filter web        # 只同步包含"web"的模板
  node scripts/sync-config.mjs --filter miniprogram # 只同步小程序模板
  node scripts/sync-config.mjs --skip-git          # 跳过Git操作
  node scripts/sync-config.mjs --backup            # 创建备份

准备工作:
1. 克隆目标仓库到上级目录：
   cd ..
   git clone https://github.com/TencentCloudBase/awsome-cloudbase-examples.git

2. 确保你有该仓库的推送权限

配置文件: scripts/template-config.json
模板总数: ${templateConfig.templates.length} 个

配置格式说明:
- 字符串格式: "path/to/template" - 同步整个config目录
- 对象格式: { "path": "path/to/template", "includePatterns": ["dir1", "dir2"] } - 只同步指定目录
  示例: { "path": "airules/codebuddy", "includePatterns": ["rules", ".rules"] }
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args) {
  const options = {
    dryRun: false,
    skipGit: false,
    createBackup: undefined,
    filter: null,
    showHelp: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.showHelp = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-git':
        options.skipGit = true;
        break;
      case '--backup':
        options.createBackup = true;
        break;
      case '--filter':
        if (i + 1 < args.length) {
          options.filter = args[i + 1];
          i++; // 跳过下一个参数
        }
        break;
    }
  }

  return options;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (options.showHelp) {
    showUsage();
    return;
  }
  
  try {
    await syncConfigs(options);
    console.log('\n🎉 所有操作完成！');
  } catch (error) {
    console.error('\n❌ 脚本执行失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数（仅在作为 CLI 直接执行时；被 import 时不产生副作用）
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(console.error);
}
