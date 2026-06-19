// Prompts data loaded from prompts.json
// This file is auto-generated from doc/prompts/config.yaml
// Run: npm run build:prompts-data

import promptsDataJson from './prompts.json';

export interface PromptRule {
  id: string;
  title: string;
  description: string;
  category: string;
  order: number;
  prompts: string[];
}

export const allPrompts: PromptRule[] = promptsDataJson;

// Extract all prompts into a flat array
export const getAllPrompts = (): string[] => {
  return allPrompts.flatMap(rule => rule.prompts);
};

// Get random prompt
export const getRandomPrompt = (): string => {
  const prompts = getAllPrompts();
  return prompts[Math.floor(Math.random() * prompts.length)];
};

// Get prompts by category
export const getPromptsByCategory = (category: string): string[] => {
  return allPrompts
    .filter(rule => rule.category === category)
    .flatMap(rule => rule.prompts);
};

// Get random prompt by category
export const getRandomPromptByCategory = (category: string): string => {
  const prompts = getPromptsByCategory(category);
  if (prompts.length === 0) {
    // Fallback to all prompts if category has no prompts
    return getRandomPrompt();
  }
  return prompts[Math.floor(Math.random() * prompts.length)];
};

// Get prompts by rule ID
export const getPromptsByRuleId = (ruleId: string): string[] => {
  const rule = allPrompts.find(r => r.id === ruleId);
  return rule ? rule.prompts : [];
};

// Get random prompt by rule ID
export const getRandomPromptByRuleId = (ruleId: string): string => {
  const prompts = getPromptsByRuleId(ruleId);
  if (prompts.length === 0) {
    // Fallback to all prompts if rule not found
    return getRandomPrompt();
  }
  return prompts[Math.floor(Math.random() * prompts.length)];
};

