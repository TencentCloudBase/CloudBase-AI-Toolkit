export interface Experiment {
  id: string;
  harness: 'fixture' | 'claude-code' | 'codex' | 'opencode' | 'codebuddy-code';
  modelId: string;
  skills: boolean;
  suite: 'benchmark' | 'no-skills';
}

/**
 * 进榜实验必须有 `-no-skills` 孪生。fixture-dry 只用于本地验收，不上榜。
 * modelId 是标准模型名。cbc 的 -ioa 通道 id 不写在这里。
 */
export const EXPERIMENTS: Experiment[] = [
  {
    id: 'fixture-dry',
    harness: 'fixture',
    modelId: 'fixture',
    skills: false,
    suite: 'benchmark',
  },
  {
    id: 'claude-code-sonnet',
    harness: 'claude-code',
    modelId: 'claude-sonnet-4-6',
    skills: true,
    suite: 'benchmark',
  },
  {
    id: 'claude-code-sonnet-no-skills',
    harness: 'claude-code',
    modelId: 'claude-sonnet-4-6',
    skills: false,
    suite: 'no-skills',
  },
  {
    id: 'opencode-glm',
    harness: 'opencode',
    modelId: 'glm-5.2',
    skills: true,
    suite: 'benchmark',
  },
  {
    id: 'cbc-hy4-no-skills',
    harness: 'codebuddy-code',
    modelId: 'hy4',
    skills: false,
    suite: 'no-skills',
  },
];

export function findExperiment(id: string): Experiment {
  const found = EXPERIMENTS.find((item) => item.id === id);
  if (!found) {
    throw new Error(
      `Unknown experiment: ${id}. Known: ${EXPERIMENTS.map((item) => item.id).join(', ')}`,
    );
  }
  return found;
}
