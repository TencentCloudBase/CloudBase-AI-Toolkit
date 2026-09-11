import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { afterAll, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 生成器会原地重写这些产物；测试前快照、测试后还原，
// 避免「跑一次测试就改一堆 tracked 文件」污染工作区。
const ARTIFACT_PATHS = [
  path.join(ROOT_DIR, 'doc', 'prompts'),
  path.join(ROOT_DIR, 'doc', 'components', 'prompts.json'),
  path.join(ROOT_DIR, 'doc', 'sidebar.json'),
];

function runScript(scriptPath, args = []) {
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });
    console.log(`Script ${scriptPath} output:`, stdout?.toString());
  } catch (error) {
    console.error(`Script ${scriptPath} failed:`);
    console.error('stdout:', error.stdout?.toString());
    console.error('stderr:', error.stderr?.toString());
    throw error;
  }
}

function snapshotArtifacts() {
  const snapshot = new Map();

  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      snapshot.set(path.relative(ROOT_DIR, target), fs.readFileSync(target));
      return;
    }
    for (const entry of fs.readdirSync(target)) {
      walk(path.join(target, entry));
    }
  };

  ARTIFACT_PATHS.forEach(walk);
  return snapshot;
}

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** 还原快照；生成器只新增/改写文件、不删文件，删除分支只是兜底 */
function restoreArtifacts(snapshot) {
  for (const rel of snapshotArtifacts().keys()) {
    if (!snapshot.has(rel)) {
      // 若被安全钩子拦下（EPERM），只提示、不失败——漂移断言已给出结论
      try {
        fs.unlinkSync(path.join(ROOT_DIR, rel));
      } catch (error) {
        console.warn(`[generate-prompts.test] 未能清理测试期间新增的 ${rel}：${error.message}`);
      }
    }
  }

  for (const [rel, content] of snapshot) {
    const abs = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(abs) || digest(fs.readFileSync(abs)) !== digest(content)) {
      fs.writeFileSync(abs, content);
    }
  }
}

const artifactsBefore = snapshotArtifacts();
afterAll(() => restoreArtifacts(artifactsBefore));

test('generate-prompts builds prompt docs from skills source', () => {
  runScript('scripts/generate-prompts-data.mjs');
  runScript('scripts/generate-prompts.mjs');

  // 产物必须与仓库中已提交的内容一致：源改了却没重新生成即失败。
  // 失败时执行 `npm run build:prompts-data` 重新生成并提交产物即可。
  const artifactsAfter = snapshotArtifacts();
  const drift = [
    ...[...artifactsAfter.keys()].filter((rel) => !artifactsBefore.has(rel)).map((rel) => `新增 ${rel}`),
    ...[...artifactsBefore.keys()].filter((rel) => !artifactsAfter.has(rel)).map((rel) => `缺失 ${rel}`),
    ...[...artifactsAfter.keys()]
      .filter((rel) => artifactsBefore.has(rel) && digest(artifactsBefore.get(rel)) !== digest(artifactsAfter.get(rel)))
      .map((rel) => `内容变化 ${rel}`),
  ].sort();

  expect(
    drift,
    `文档产物与 skills 源不一致，请执行 \`npm run build:prompts-data\` 并提交产物：\n${drift.join('\n')}`,
  ).toEqual([]);

  const authWebPrompt = fs.readFileSync(
    path.join(ROOT_DIR, 'doc', 'prompts', 'auth-web-cloudbase.mdx'),
    'utf8',
  );

  expect(authWebPrompt).toContain('# 身份认证：Web SDK');
  expect(authWebPrompt).toContain('AIDevelopmentPrompt');
  expect(authWebPrompt).toContain('npx skills add tencentcloudbase/cloudbase-skills');
  expect(authWebPrompt).toContain('npx skills add https://github.com/tencentcloudbase/skills --skill auth-web-cloudbase');
  expect(authWebPrompt).toContain('https://skills.sh/tencentcloudbase/skills/auth-web-cloudbase');
  expect(authWebPrompt).not.toContain('title="rule.md"');

  const authHttpApiPrompt = fs.readFileSync(
    path.join(ROOT_DIR, 'doc', 'prompts', 'auth-http-api.mdx'),
    'utf8',
  );

  expect(authHttpApiPrompt).toContain('npx skills add https://github.com/tencentcloudbase/skills --skill http-api-cloudbase');
  expect(authHttpApiPrompt).toContain('https://skills.sh/tencentcloudbase/skills/http-api-cloudbase');
});

test('every skill source is registered in doc/prompts/config.yaml', () => {
  // 复用 check-prompts-sync 的覆盖率检查，避免两套实现各自漂移。
  runScript('scripts/check-prompts-sync.mjs', ['--coverage-only']);
});
