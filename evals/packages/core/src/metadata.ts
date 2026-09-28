import { parseFrontmatter, splitFrontmatter, type FrontmatterDoc } from './frontmatter.ts';

export const EVAL_STAGES = ['build', 'resolve', 'investigate'] as const;
export const EVAL_INTERFACES = ['mcp', 'cli'] as const;
export const EVAL_PRODUCTS = [
  'auth',
  'database',
  'storage',
  'functions',
  'cloudrun',
  'hosting',
  'ai',
] as const;
export const EVAL_SUITES = ['benchmark', 'regression'] as const;

export type EvalStage = (typeof EVAL_STAGES)[number];
export type EvalInterface = (typeof EVAL_INTERFACES)[number];
export type EvalProduct = (typeof EVAL_PRODUCTS)[number];
export type EvalSuite = (typeof EVAL_SUITES)[number];

export interface EvalMetadata {
  stage: EvalStage;
  interface: EvalInterface;
  product: EvalProduct[];
  topic: string[];
  motivation?: string;
}

export interface ParsedPrompt {
  metadata: EvalMetadata;
  body: string;
}

function asString(doc: FrontmatterDoc, key: string): string {
  const value = doc[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`frontmatter.${key} must be a non-empty string`);
  }
  return value;
}

function asList(doc: FrontmatterDoc, key: string): string[] {
  const value = doc[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`frontmatter.${key} must be a non-empty list`);
  }
  return value;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], key: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`frontmatter.${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function parsePromptMarkdown(markdown: string): ParsedPrompt {
  const { raw, body } = splitFrontmatter(markdown);
  const doc = parseFrontmatter(raw);
  const product = asList(doc, 'product').map((item) =>
    oneOf(item, EVAL_PRODUCTS, 'product'),
  );
  const topic = asList(doc, 'topic');
  const motivation = doc.motivation;
  return {
    metadata: {
      stage: oneOf(asString(doc, 'stage'), EVAL_STAGES, 'stage'),
      interface: oneOf(asString(doc, 'interface'), EVAL_INTERFACES, 'interface'),
      product,
      topic,
      motivation: typeof motivation === 'string' ? motivation : undefined,
    },
    body: body.trim(),
  };
}
