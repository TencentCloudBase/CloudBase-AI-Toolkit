/**
 * Runner 只负责 install + exec。transcript 解析在 parser。
 * 接口不假设桌面 GUI 还是 CLI，桌面产品以后按同一接口补接。
 */

export const HARNESS_IDS = [
  'fixture',
  'claude-code',
  'codex',
  'opencode',
  'codebuddy-code',
] as const;

export type HarnessId = (typeof HARNESS_IDS)[number];

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface RunnerExecArgs {
  workspace: string;
  model: string;
  apiKey: string;
  promptPath: string;
  reasoningEffort?: 'high';
  timeoutSec: number;
  maxTurns?: number;
  skills: boolean;
}

export interface RunnerExecResult {
  command: CommandResult;
  raw?: string;
}

export interface AgentRunner {
  id: HarnessId;
  displayName: string;
  apiKeyEnvVar: string;
  cliPackage: string;
  defaultCliVersion: string;
  defaultModel: string;
  install(version: string): Promise<void>;
  exec(args: RunnerExecArgs): Promise<RunnerExecResult>;
  extractUsage?(raw: string | undefined, model: string): AgentUsage | undefined;
  extractStepCount?(raw: string | undefined): number | undefined;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

/** 两个示例场景 EVAL.ts 草案共同依赖的上下文。干跑给假实现，真跑才碰环境。 */
export interface EvalContext {
  envId: string;
  anonymousSdkLogin: () => Promise<unknown>;
  getAuthConfig: () => Promise<{ usernameLoginEnabled: boolean }>;
  runDriver: (args: string[]) => Promise<Record<string, { userId?: string; displayName?: string; threw?: string }>>;
  asEndUser: () => Promise<SdkHandle>;
  asAnonymous: () => Promise<SdkHandle>;
}

export interface SdkHandle {
  collection(name: string): {
    create(doc: unknown): Promise<{ id: string }>;
    read(id: string): Promise<unknown | null>;
    update(id: string, patch: unknown): Promise<void>;
    remove(id: string): Promise<void>;
  };
}

export type Scorer = (ctx: EvalContext) => Promise<CheckResult[]>;

export interface RunResult {
  experiment: string;
  eval: string;
  run: number;
  harness: HarnessId;
  /** 标准模型名，不含 -ioa 通道标识。 */
  modelId: string;
  /** cbc --model 实际传入的 id。仅 codebuddy-code 有值。 */
  providerModelId?: string;
  cliVersion: string;
  skills: boolean;
  envId: string;
  mode: 'dry-run' | 'live';
  passed: boolean;
  checks: CheckResult[];
  usage?: AgentUsage;
  stepCount?: number;
}
