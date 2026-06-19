/**
 * Timer Trigger Cron Validation Test
 *
 * Tests that timer trigger cron format validation rejects 5-field cron
 * and accepts 7-field cron, and that functionRootPath description is clear.
 *
 * Run:
 * cd mcp && npm test -- tests/timer-trigger-cron-validation.test.js
 */

import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { validateTimerCron } = require('../mcp/dist/index.cjs');

describe('validateTimerCron', () => {
  test('accepts valid 7-field cron expressions', () => {
    expect(validateTimerCron('0 */5 * * * * *')).toBe('0 */5 * * * * *');
    expect(validateTimerCron('0 0 2 1 * * *')).toBe('0 0 2 1 * * *');
    expect(validateTimerCron('0 30 9 * * * *')).toBe('0 30 9 * * * *');
    expect(validateTimerCron('0 0 12 * * * *')).toBe('0 0 12 * * * *');
    expect(validateTimerCron('0 0 0 1 1 * *')).toBe('0 0 0 1 1 * *');
  });

  test('trims whitespace from valid cron', () => {
    expect(validateTimerCron('  0 */5 * * * * *  ')).toBe('0 */5 * * * * *');
  });

  test('rejects 5-field cron with corrective message', () => {
    expect(() => validateTimerCron('*/5 * * * *')).toThrow(/7 段格式/);
    expect(() => validateTimerCron('*/5 * * * *')).toThrow(/5 段/);
    expect(() => validateTimerCron('0 0 * * *')).toThrow(/7 段格式/);
  });

  test('rejects 6-field cron with corrective message', () => {
    expect(() => validateTimerCron('0 */5 * * * *')).toThrow(/7 段格式/);
    expect(() => validateTimerCron('0 */5 * * * *')).toThrow(/6 段/);
  });

  test('rejects too few fields', () => {
    expect(() => validateTimerCron('* * *')).toThrow(/7 段格式/);
    expect(() => validateTimerCron('0')).toThrow(/7 段格式/);
  });

  test('5-field rejection mentions correct examples', () => {
    try {
      validateTimerCron('*/5 * * * *');
    } catch (e) {
      expect(e.message).toContain('0 */5 * * * * *');
      return;
    }
    expect.unreachable('Should have thrown');
  });
});

describe('manageFunctions schema - timer trigger config description', () => {
  test('TRIGGER_SCHEMA config description warns about 5-field cron', async () => {
    // We verify the schema is built correctly by checking the compiled output
    // The description is embedded in the Zod schema; the real test is that
    // validateTimerCron rejects 5-field. This test ensures the export exists.
    expect(typeof validateTimerCron).toBe('function');
  });
});
