/**
 * Python Function Support Test
 *
 * 测试多语言云函数支持功能
 *
 * 运行方式:
 * cd mcp && npm test -- tests/python-function-support.test.js
 */

import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import from compiled CommonJS file
const {
  SUPPORTED_RUNTIMES,
  ALL_SUPPORTED_RUNTIMES,
  DEFAULT_RUNTIME,
  RECOMMENDED_RUNTIMES,
  formatRuntimeList,
  SUPPORTED_NODEJS_RUNTIMES,
  DEFAULT_NODEJS_RUNTIME
} = require('../mcp/dist/index.cjs');

describe('Multi-Language Runtime Support', () => {
  test('SUPPORTED_RUNTIMES should contain all language categories', () => {
    console.log('SUPPORTED_RUNTIMES:', SUPPORTED_RUNTIMES);
    console.log('Type:', typeof SUPPORTED_RUNTIMES);

    expect(SUPPORTED_RUNTIMES).toBeDefined();
    expect(SUPPORTED_RUNTIMES).not.toBeNull();
    expect(SUPPORTED_RUNTIMES).toHaveProperty('nodejs');
    expect(SUPPORTED_RUNTIMES).toHaveProperty('python');
    expect(SUPPORTED_RUNTIMES).toHaveProperty('php');
    expect(SUPPORTED_RUNTIMES).toHaveProperty('java');
    expect(SUPPORTED_RUNTIMES).toHaveProperty('golang');
  });

  test('ALL_SUPPORTED_RUNTIMES should include all runtimes', () => {
    expect(ALL_SUPPORTED_RUNTIMES).toContain('Nodejs18.15');
    expect(ALL_SUPPORTED_RUNTIMES).toContain('Python3.9');
    expect(ALL_SUPPORTED_RUNTIMES).toContain('Php7.4');
    expect(ALL_SUPPORTED_RUNTIMES).toContain('Java11');
    expect(ALL_SUPPORTED_RUNTIMES).toContain('Golang1');
  });

  test('DEFAULT_RUNTIME should be Nodejs18.15', () => {
    expect(DEFAULT_RUNTIME).toBe('Nodejs18.15');
  });

  test('RECOMMENDED_RUNTIMES should have all languages', () => {
    expect(RECOMMENDED_RUNTIMES.nodejs).toBe('Nodejs18.15');
    expect(RECOMMENDED_RUNTIMES.python).toBe('Python3.9');
    expect(RECOMMENDED_RUNTIMES.php).toBe('Php7.4');
    expect(RECOMMENDED_RUNTIMES.java).toBe('Java11');
    expect(RECOMMENDED_RUNTIMES.golang).toBe('Golang1');
  });

  test('formatRuntimeList should return formatted string', () => {
    const formatted = formatRuntimeList();
    expect(formatted).toContain('Nodejs:');
    expect(formatted).toContain('Python:');
    expect(formatted).toContain('Php:');
    expect(formatted).toContain('Java:');
    expect(formatted).toContain('Golang:');
  });

  test('Backward compatibility: SUPPORTED_NODEJS_RUNTIMES should work', () => {
    expect(SUPPORTED_NODEJS_RUNTIMES).toEqual(SUPPORTED_RUNTIMES.nodejs);
  });

  test('Backward compatibility: DEFAULT_NODEJS_RUNTIME should work', () => {
    expect(DEFAULT_NODEJS_RUNTIME).toBe(DEFAULT_RUNTIME);
  });

  test('Python runtimes should include all versions', () => {
    expect(SUPPORTED_RUNTIMES.python).toContain('Python3.10');
    expect(SUPPORTED_RUNTIMES.python).toContain('Python3.9');
    expect(SUPPORTED_RUNTIMES.python).toContain('Python3.7');
    expect(SUPPORTED_RUNTIMES.python).toContain('Python3.6');
    expect(SUPPORTED_RUNTIMES.python).toContain('Python2.7');
  });

  test('PHP runtimes should include all versions', () => {
    expect(SUPPORTED_RUNTIMES.php).toContain('Php8.0');
    expect(SUPPORTED_RUNTIMES.php).toContain('Php7.4');
    expect(SUPPORTED_RUNTIMES.php).toContain('Php7.2');
  });

  test('Java runtimes should include all versions', () => {
    expect(SUPPORTED_RUNTIMES.java).toContain('Java8');
    expect(SUPPORTED_RUNTIMES.java).toContain('Java11');
  });

  test('Go runtimes should include Golang1', () => {
    expect(SUPPORTED_RUNTIMES.golang).toContain('Golang1');
  });

  test('ALL_SUPPORTED_RUNTIMES should have correct count', () => {
    const expectedCount = 
      SUPPORTED_RUNTIMES.nodejs.length +
      SUPPORTED_RUNTIMES.python.length +
      SUPPORTED_RUNTIMES.php.length +
      SUPPORTED_RUNTIMES.java.length +
      SUPPORTED_RUNTIMES.golang.length;
    
    expect(ALL_SUPPORTED_RUNTIMES.length).toBe(expectedCount);
  });

  test('No duplicate runtimes in ALL_SUPPORTED_RUNTIMES', () => {
    const uniqueRuntimes = new Set(ALL_SUPPORTED_RUNTIMES);
    expect(uniqueRuntimes.size).toBe(ALL_SUPPORTED_RUNTIMES.length);
  });

  test('formatRuntimeList should format correctly', () => {
    const formatted = formatRuntimeList();
    const lines = formatted.split('\n');
    
    // Should have 5 lines (one for each language)
    expect(lines.length).toBe(5);
    
    // Each line should start with language name
    expect(lines[0]).toMatch(/^\s+Nodejs:/);
    expect(lines[1]).toMatch(/^\s+Python:/);
    expect(lines[2]).toMatch(/^\s+Php:/);
    expect(lines[3]).toMatch(/^\s+Java:/);
    expect(lines[4]).toMatch(/^\s+Golang:/);
  });
});

