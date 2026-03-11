import { describe, it, expect } from 'vitest';
import {
  buildToolResult,
  successResult,
  errorResult,
  buildNextAction,
  toMCPResponse,
  recommendDocs,
  errorWithDocs,
  isToolResult,
  type ToolResult,
  type NextAction
} from '../response-builder.js';

describe('response-builder', () => {
  describe('buildToolResult', () => {
    it('should build a basic tool result', () => {
      const result = buildToolResult(true, { id: 1 }, 'Success');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1 });
      expect(result.message).toBe('Success');
      expect(result.nextActions).toBeUndefined();
    });

    it('should include nextActions when provided', () => {
      const nextActions: NextAction[] = [
        { tool: 'queryFunctions', reason: 'Verify creation' }
      ];
      const result = buildToolResult(true, { id: 1 }, 'Success', nextActions);
      expect(result.nextActions).toEqual(nextActions);
    });

    it('should not include empty nextActions array', () => {
      const result = buildToolResult(true, { id: 1 }, 'Success', []);
      expect(result.nextActions).toBeUndefined();
    });
  });

  describe('successResult', () => {
    it('should build a success result', () => {
      const result = successResult({ id: 1 }, 'Created successfully');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1 });
      expect(result.message).toBe('Created successfully');
    });
  });

  describe('errorResult', () => {
    it('should build an error result with null data', () => {
      const result = errorResult('Error occurred');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toBe('Error occurred');
    });

    it('should build an error result with custom data', () => {
      const result = errorResult('Error occurred', { code: 'ERR_001' });
      expect(result.success).toBe(false);
      expect(result.data).toEqual({ code: 'ERR_001' });
    });
  });

  describe('buildNextAction', () => {
    it('should build a basic next action', () => {
      const action = buildNextAction('queryFunctions', undefined, 'Verify creation');
      expect(action.tool).toBe('queryFunctions');
      expect(action.reason).toBe('Verify creation');
      expect(action.params).toBeUndefined();
      expect(action.priority).toBeUndefined();
    });

    it('should include params when provided', () => {
      const action = buildNextAction(
        'manageFunctions',
        { action: 'create', functionName: 'test' },
        'Create function'
      );
      expect(action.params).toEqual({ action: 'create', functionName: 'test' });
    });

    it('should not include empty params object', () => {
      const action = buildNextAction('queryFunctions', {}, 'Verify');
      expect(action.params).toBeUndefined();
    });

    it('should include priority when provided', () => {
      const action = buildNextAction('queryFunctions', undefined, 'Verify', 'high');
      expect(action.priority).toBe('high');
    });
  });

  describe('toMCPResponse', () => {
    it('should convert ToolResult to MCP response format', () => {
      const result = successResult({ id: 1 }, 'Success');
      const mcpResponse = toMCPResponse(result);
      
      expect(mcpResponse.content).toHaveLength(1);
      expect(mcpResponse.content[0].type).toBe('text');
      expect(mcpResponse.content[0].text).toContain('"success": true');
      expect(mcpResponse.content[0].text).toContain('"id": 1');
    });
  });

  describe('recommendDocs', () => {
    it('should build a searchKnowledgeBase recommendation', () => {
      const action = recommendDocs('cloud-functions', 'Read function guide');
      
      expect(action.tool).toBe('searchKnowledgeBase');
      expect(action.params).toEqual({ mode: 'skills', skillName: 'cloud-functions' });
      expect(action.reason).toBe('Read function guide');
      expect(action.priority).toBe('high');
    });

    it('should support custom priority', () => {
      const action = recommendDocs('cloud-functions', 'Optional reading', 'medium');
      expect(action.priority).toBe('medium');
    });
  });

  describe('errorWithDocs', () => {
    it('should build error result with docs recommendation', () => {
      const result = errorWithDocs(
        'Missing parameters',
        'cloud-functions',
        'Read the guide to understand required parameters'
      );
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Missing parameters');
      expect(result.nextActions).toHaveLength(1);
      expect(result.nextActions![0].tool).toBe('searchKnowledgeBase');
    });

    it('should include additional actions', () => {
      const additionalAction = buildNextAction(
        'manageFunctions',
        { action: 'create', confirm: true },
        'Retry with correct parameters'
      );
      
      const result = errorWithDocs(
        'Missing parameters',
        'cloud-functions',
        'Read the guide',
        null,
        [additionalAction]
      );
      
      expect(result.nextActions).toHaveLength(2);
      expect(result.nextActions![0].tool).toBe('searchKnowledgeBase');
      expect(result.nextActions![1].tool).toBe('manageFunctions');
    });
  });

  describe('isToolResult', () => {
    it('should return true for valid ToolResult', () => {
      const result = successResult({ id: 1 }, 'Success');
      expect(isToolResult(result)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isToolResult(null)).toBe(false);
      expect(isToolResult(undefined)).toBe(false);
      expect(isToolResult({})).toBe(false);
      expect(isToolResult({ success: true })).toBe(false);
      expect(isToolResult({ success: true, data: null })).toBe(false);
      expect(isToolResult({ success: true, data: null, message: 123 })).toBe(false);
    });
  });
});

