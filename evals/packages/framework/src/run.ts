import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalContext, RunResult, SdkHandle } from '../../core/src/types.ts';
import type { Scenario } from '../../core/src/load-scenario.ts';
import { openSandbox, type SandboxEnv } from '../../sandbox/src/env.ts';
import { buildLocalMcpConfig, buildMcpConfig, preseedCliLogin, readCloudBaseCreds } from '../../sandbox/src/login.ts';
import type { Experiment } from '../../../experiments/presets.ts';
import { RUNNERS } from './harnesses.ts';
import { toCbcModelId } from './models.ts';
import { copyFixture } from './workspace.ts';

const emptyDoc = {
  async create() {
    return { id: '' };
  },
  async read() {
    return null;
  },
  async update() {},
  async remove() {},
};

function handle(rejectWrites: boolean): SdkHandle {
  return {
    collection() {
      return {
        ...emptyDoc,
        async create() {
          if (rejectWrites) throw new Error('anonymous rejected');
          return { id: '' };
        },
      };
    },
  };
}

/** 干跑上下文：评分器会执行，但所有云调用都是固定假值，不发请求。 */
export function dryEvalContext(envId: string): EvalContext {
  return {
    envId,
    anonymousSdkLogin: async () => ({}),
    getAuthConfig: async () => ({ usernameLoginEnabled: false }),
    runDriver: async () => ({}),
    asEndUser: async () => handle(false),
    asAnonymous: async () => handle(true),
  };
}

export async function runScenario(options: {
  evalsRoot: string;
  scenario: Scenario;
  experiment: Experiment;
  run: number;
  maxTurns?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<RunResult> {
  const sandbox: SandboxEnv = openSandbox(options.env);
  const runner = RUNNERS[options.experiment.harness];
  const providerModelId =
    runner.id === 'codebuddy-code' ? toCbcModelId(options.experiment.modelId) : undefined;
  const workspace = await copyFixture(options.scenario.dir);
  const creds = readCloudBaseCreds(options.env);
  const localEndpoint = (options.env?.CLOUDBASE_LOCAL_ENDPOINT ?? process.env.CLOUDBASE_LOCAL_ENDPOINT)?.trim();
  const mcpBin = (options.env?.CLOUDBASE_MCP_BIN ?? process.env.CLOUDBASE_MCP_BIN)?.trim();
  const mcpConfig = localEndpoint && mcpBin
    ? buildLocalMcpConfig(localEndpoint, mcpBin)
    : creds
      ? buildMcpConfig(creds)
      : '{"mcpServers":{}}';
  if (creds && !localEndpoint) {
    await preseedCliLogin(workspace, creds);
  }
  const promptPath = path.join(workspace, 'TASK.md');
  await writeFile(promptPath, `${options.scenario.body}\n`);
  const execResult = await runner.exec({
    workspace,
    model: options.experiment.modelId,
    apiKey: 'dry-run',
    promptPath,
    reasoningEffort: 'high',
    timeoutSec: runner.id === 'codebuddy-code' ? 1800 : 60,
    maxTurns: options.maxTurns,
    skills: options.experiment.skills,
    mcpConfig,
  });

  const scoreCtx = dryEvalContext(sandbox.envId);
  if (localEndpoint) {
    scoreCtx.localEndpoint = localEndpoint;
  } else if (creds) {
    scoreCtx.live = creds;
  }
  scoreCtx.workspace = workspace;
  let checks;
  try {
    checks = await options.scenario.scorer(scoreCtx);
  } catch (error) {
    checks = [{
      name: 'scorer',
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    }];
  }
  let usage: RunResult['usage'];
  let stepCount: number | undefined;
  try {
    usage = runner.extractUsage?.(execResult.raw, options.experiment.modelId);
    stepCount = runner.extractStepCount?.(execResult.raw);
  } catch {
    usage = undefined;
    stepCount = undefined;
  }
  const result: RunResult = {
    experiment: options.experiment.id,
    eval: options.scenario.id,
    run: options.run,
    harness: runner.id,
    modelId: options.experiment.modelId,
    providerModelId,
    cliVersion: runner.defaultCliVersion,
    skills: options.experiment.skills,
    envId: sandbox.envId,
    mode: sandbox.mode,
    passed: checks.every((check) => check.passed),
    checks,
    usage,
    stepCount,
  };

  const outDir = path.join(
    options.evalsRoot,
    'results',
    options.experiment.id,
    options.scenario.id,
    `run-${options.run}`,
  );
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (execResult.raw) {
    await writeFile(path.join(outDir, 'transcript.jsonl'), execResult.raw);
  }
  if (execResult.command.stderr) {
    await writeFile(path.join(outDir, 'stderr.txt'), execResult.command.stderr);
  }
  return result;
}
