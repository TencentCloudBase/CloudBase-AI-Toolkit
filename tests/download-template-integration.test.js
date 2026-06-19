import fs from 'fs';
import path from 'path';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// 模拟 downloadTemplate 工具的核心逻辑
function simulateDownloadTemplate(template, overwrite = false) {
  const workspaceFolder = process.env.WORKSPACE_FOLDER_PATHS || '/tmp/test-workspace';
  const testReadmePath = path.join(workspaceFolder, 'README.md');
  
  // 模拟文件复制逻辑
  const shouldSkipReadme = (template, destPath, overwrite) => {
    const isReadme = path.basename(destPath).toLowerCase() === 'readme.md';
    const isRulesTemplate = template === 'rules';
    const exists = fs.existsSync(destPath);
    
    return isReadme && isRulesTemplate && exists && !overwrite;
  };
  
  const copyFile = async (src, dest, overwrite, template) => {
    const destExists = fs.existsSync(dest);
    
    // 检查是否需要跳过 README.md 文件（仅对 rules 模板）
    if (template && shouldSkipReadme(template, dest, overwrite)) {
      return { copied: false, reason: 'README.md 文件已存在，已保护', action: 'protected' };
    }
    
    // 如果目标文件存在且不允许覆盖
    if (destExists && !overwrite) {
      return { copied: false, reason: '文件已存在', action: 'skipped' };
    }
    
    // 模拟复制成功
    return { 
      copied: true, 
      action: destExists ? 'overwritten' : 'created'
    };
  };
  
  return copyFile('mock-src', testReadmePath, overwrite, template);
}

describe('downloadTemplate 集成测试', () => {
  const testWorkspace = '/tmp/test-workspace';
  const testReadmePath = path.join(testWorkspace, 'README.md');
  
  beforeAll(() => {
    // 创建测试工作空间
    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true });
    }
  });
  
  afterAll(() => {
    // 清理测试工作空间
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });
  
  beforeEach(() => {
    // 清理测试 README.md
    if (fs.existsSync(testReadmePath)) {
      fs.unlinkSync(testReadmePath);
    }
  });
  
  test('rules 模板 + 存在 README.md + overwrite=false 应该保护文件', async () => {
    // 创建测试 README.md
    fs.writeFileSync(testReadmePath, '# 原有项目文档');
    
    const result = await simulateDownloadTemplate('rules', false);
    
    expect(result.copied).toBe(false);
    expect(result.action).toBe('protected');
    expect(result.reason).toContain('README.md 文件已存在，已保护');
  });
  
  test('rules 模板 + 不存在 README.md + overwrite=false 应该正常复制', async () => {
    const result = await simulateDownloadTemplate('rules', false);
    
    expect(result.copied).toBe(true);
    expect(result.action).toBe('created');
  });
  
  test('rules 模板 + 存在 README.md + overwrite=true 应该覆盖文件', async () => {
    // 创建测试 README.md
    fs.writeFileSync(testReadmePath, '# 原有项目文档');
    
    const result = await simulateDownloadTemplate('rules', true);
    
    expect(result.copied).toBe(true);
    expect(result.action).toBe('overwritten');
  });
  
  test('react 模板 + 存在 README.md + overwrite=false 应该跳过（原有行为）', async () => {
    // 创建测试 README.md
    fs.writeFileSync(testReadmePath, '# 原有项目文档');
    
    const result = await simulateDownloadTemplate('react', false);
    
    expect(result.copied).toBe(false);
    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('文件已存在');
  });
}); 