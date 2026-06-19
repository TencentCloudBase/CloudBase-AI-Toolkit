import fs from 'fs';
import path from 'path';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// 模拟 shouldSkipReadme 函数逻辑
function shouldSkipReadme(template, destPath, overwrite) {
  const isReadme = path.basename(destPath).toLowerCase() === 'readme.md';
  const isRulesTemplate = template === 'rules';
  const exists = fs.existsSync(destPath);
  
  return isReadme && isRulesTemplate && exists && !overwrite;
}

describe('README.md 保护逻辑测试', () => {
  const testDir = path.join(__dirname, 'fixtures', 'readme-test');
  
  beforeAll(() => {
    // 创建测试目录
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });
  
  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
  
  beforeEach(() => {
    // 清理测试文件
    const readmePath = path.join(testDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      fs.unlinkSync(readmePath);
    }
  });
  
  test('rules 模板 + 存在 README.md + overwrite=false 应该跳过', () => {
    // 创建测试 README.md 文件
    const readmePath = path.join(testDir, 'README.md');
    fs.writeFileSync(readmePath, '# Test README');
    
    const result = shouldSkipReadme('rules', readmePath, false);
    expect(result).toBe(true);
  });
  
  test('rules 模板 + 不存在 README.md + overwrite=false 不应该跳过', () => {
    const readmePath = path.join(testDir, 'nonexistent-README.md');
    
    const result = shouldSkipReadme('rules', readmePath, false);
    expect(result).toBe(false);
  });
  
  test('rules 模板 + 存在 README.md + overwrite=true 不应该跳过', () => {
    // 创建测试 README.md 文件
    const readmePath = path.join(testDir, 'README.md');
    fs.writeFileSync(readmePath, '# Test README');
    
    const result = shouldSkipReadme('rules', readmePath, true);
    expect(result).toBe(false);
  });
  
  test('react 模板 + 存在 README.md + overwrite=false 不应该跳过', () => {
    // 创建测试 README.md 文件
    const readmePath = path.join(testDir, 'README.md');
    fs.writeFileSync(readmePath, '# Test README');
    
    const result = shouldSkipReadme('react', readmePath, false);
    expect(result).toBe(false);
  });
  
  test('非 README.md 文件 + rules 模板 + 存在文件 + overwrite=false 不应该跳过', () => {
    // 创建测试文件
    const testFilePath = path.join(testDir, 'test.js');
    fs.writeFileSync(testFilePath, 'console.log("test")');
    
    const result = shouldSkipReadme('rules', testFilePath, false);
    expect(result).toBe(false);
  });
}); 