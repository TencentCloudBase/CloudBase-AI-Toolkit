import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listScenarioIds, loadScenario } from '../../core/src/load-scenario.ts';
import { EXPERIMENTS, findExperiment } from '../../../experiments/presets.ts';
import { runScenario } from './run.ts';

const evalsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

async function main(): Promise<void> {
  const [command, scenarioId, ...rest] = process.argv.slice(2);

  if (command === 'list') {
    const ids = await listScenarioIds(evalsRoot);
    process.stdout.write(`${ids.join('\n')}\n`);
    process.stdout.write(`experiments: ${EXPERIMENTS.map((item) => item.id).join(', ')}\n`);
    return;
  }

  if (command !== 'run' || !scenarioId) {
    throw new Error('Usage: cli.ts list | cli.ts run <scenario-id> --experiment <id> [--run N]');
  }

  const experimentId = flag(rest, '--experiment');
  if (!experimentId) throw new Error('--experiment is required');
  const run = Number(flag(rest, '--run') ?? '1');
  const maxTurnsFlag = flag(rest, '--max-turns');
  const scenario = await loadScenario(evalsRoot, scenarioId);
  const result = await runScenario({
    evalsRoot,
    scenario,
    experiment: findExperiment(experimentId),
    run,
    maxTurns: maxTurnsFlag ? Number(maxTurnsFlag) : undefined,
  });
  process.stdout.write(
    `${JSON.stringify({ eval: result.eval, modelId: result.modelId, providerModelId: result.providerModelId, mode: result.mode, passed: result.passed })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
