import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** 题目副本。评分器 EVAL.ts 不给 agent。副本在系统临时目录，不在评测仓里。 */
export async function copyFixture(scenarioDir: string): Promise<string> {
  const dest = await mkdtemp(path.join(tmpdir(), 'cbc-eval-'));
  await cp(scenarioDir, dest, {
    recursive: true,
    filter: (source) => path.basename(source) !== 'EVAL.ts',
  });
  return dest;
}

/** 工作目录落在评测仓内部时为 true。agent 不应拿到仓库根或 packages。 */
export function workspaceInsideRepo(workspace: string, evalsRoot: string): boolean {
  const ws = path.resolve(workspace);
  const root = path.resolve(evalsRoot);
  return ws === root || ws.startsWith(root + path.sep);
}
