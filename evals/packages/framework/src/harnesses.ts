import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentRunner, AgentUsage, RunnerExecArgs, RunnerExecResult } from '../../core/src/types.ts';
import { toCbcModelId } from './models.ts';
import { parseClaudeStepCount, parseClaudeStreamUsage } from './parsers.ts';

const HIGH_EFFORT = 'high' as const;

function notInstalled(id: string): Promise<void> {
  return Promise.reject(
    new Error(`${id} install runs only on a live run. Use --experiment fixture-dry locally.`),
  );
}

function refuseExec(id: string, args: RunnerExecArgs): Promise<RunnerExecResult> {
  if (!args.apiKey) {
    return Promise.reject(new Error(`${id} requires ${id} API key via its env var`));
  }
  return Promise.reject(
    new Error(`${id} live exec is not invoked by the dry-run path.`),
  );
}

/** Claude Code headless: `claude -p --output-format stream-json`. */
export const claudeCodeRunner: AgentRunner = {
  id: 'claude-code',
  displayName: 'Claude Code',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  cliPackage: '@anthropic-ai/claude-code',
  defaultCliVersion: '2.1.280',
  defaultModel: 'claude-sonnet-4-6',
  install: (version) => notInstalled(`claude-code@${version}`),
  exec: (args) => refuseExec('claude-code', args),
  extractUsage: parseClaudeStreamUsage,
  extractStepCount: parseClaudeStepCount,
};

/** Codex headless CLI. */
export const codexRunner: AgentRunner = {
  id: 'codex',
  displayName: 'Codex',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  cliPackage: '@openai/codex',
  defaultCliVersion: '0.154.0',
  defaultModel: 'gpt-5.4',
  install: (version) => notInstalled(`codex@${version}`),
  exec: (args) => refuseExec('codex', args),
};

/** OpenCode is the multi-model shell. Internal TT Switch maps models through env, not a runner branch. */
export const opencodeRunner: AgentRunner = {
  id: 'opencode',
  displayName: 'OpenCode',
  apiKeyEnvVar: 'OPENCODE_API_KEY',
  cliPackage: 'opencode-ai',
  defaultCliVersion: '1.18.31',
  defaultModel: 'glm-5.2',
  install: (version) => notInstalled(`opencode@${version}`),
  exec: (args) => refuseExec('opencode', args),
};

function execCbc(args: RunnerExecArgs): Promise<RunnerExecResult> {
  const providerModelId = toCbcModelId(args.model);
  return readFile(args.promptPath, 'utf8').then(
    (prompt) =>
      new Promise((resolve, reject) => {
        mkdtemp(path.join(tmpdir(), 'cbc-eval-'))
          .then((cwd) => {
            const child = spawn(
              'cbc',
              [
                '-p',
                '--output-format',
                'stream-json',
                '--model',
                providerModelId,
                '--strict-mcp-config',
                '--mcp-config',
                '{"mcpServers":{}}',
                '--permission-mode',
                'bypassPermissions',
                '--max-turns',
                String(args.maxTurns ?? 1),
                '--',
                prompt,
              ],
              { cwd, env: process.env },
            );
            let stdout = '';
            let stderr = '';
            const timer = setTimeout(() => {
              child.kill('SIGTERM');
            }, args.timeoutSec * 1000);
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
              stdout += chunk;
            });
            child.stderr.on('data', (chunk: string) => {
              stderr += chunk;
            });
            child.on('error', (error) => {
              clearTimeout(timer);
              reject(error);
            });
            child.on('close', (exitCode) => {
              clearTimeout(timer);
              resolve({
                command: { exitCode: exitCode ?? 1, stdout, stderr },
                raw: stdout,
              });
            });
          })
          .catch(reject);
      }),
  );
}

/** 本机 cbc -V。结果里的模型名走标准名，--model 才用 -ioa id。 */
export const codebuddyCodeRunner: AgentRunner = {
  id: 'codebuddy-code',
  displayName: 'CodeBuddy Code',
  apiKeyEnvVar: 'CODEBUDDY_API_KEY',
  cliPackage: '@tencent-ai/codebuddy-code',
  defaultCliVersion: '2.95.0',
  defaultModel: 'hy4',
  async install() {},
  exec: execCbc,
  extractUsage: parseClaudeStreamUsage,
  extractStepCount: parseClaudeStepCount,
};

/** 不启动 CLI。给本地 30 分钟验收和 CI 用。 */
export const fixtureRunner: AgentRunner = {
  id: 'fixture',
  displayName: 'Fixture',
  apiKeyEnvVar: 'FIXTURE_API_KEY',
  cliPackage: 'fixture',
  defaultCliVersion: '0.0.0',
  defaultModel: 'fixture',
  async install() {},
  async exec(args): Promise<RunnerExecResult> {
    const raw = JSON.stringify({
      type: 'result',
      model: args.model,
      usage: { input_tokens: 0, output_tokens: 0 },
      skills: args.skills,
      reasoningEffort: args.reasoningEffort ?? HIGH_EFFORT,
    });
    return { command: { exitCode: 0, stdout: raw, stderr: '' }, raw };
  },
  extractUsage(raw): AgentUsage | undefined {
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
    };
  },
  extractStepCount: () => 0,
};

export const RUNNERS: Record<AgentRunner['id'], AgentRunner> = {
  fixture: fixtureRunner,
  'claude-code': claudeCodeRunner,
  codex: codexRunner,
  opencode: opencodeRunner,
  'codebuddy-code': codebuddyCodeRunner,
};
