import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';
import { loadYamlModule } from '../scripts/lib/load-yaml-module.mjs';
import issueAutoProcessorHelpers from '../scripts/issue-auto-processor.cjs';

const {
  extractResultText,
  extractPullRequestUrl,
  parseIssueCommentCommand,
  buildAnalysisPrompt,
  isBugIssue,
} = issueAutoProcessorHelpers;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WORKFLOW_FILE = path.join(
  ROOT_DIR,
  '.github',
  'workflows',
  'issue-auto-processor-simple.yml',
);

const yaml = await loadYamlModule(ROOT_DIR);

test('issue auto processor workflow remains valid YAML', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');
  const parsed = yaml.load(raw);

  expect(parsed).toBeTruthy();
  expect(parsed.jobs['process-issues'].steps.length).toBeGreaterThan(0);
});

test('extractResultText returns result from top-level object payload', () => {
  const raw = JSON.stringify({ result: 'Structured response' });

  expect(extractResultText(raw)).toBe('Structured response');
});

test('extractResultText returns latest assistant text from array payload', () => {
  const raw = JSON.stringify([
    { type: 'system', message: { role: 'system', content: [{ type: 'text', text: 'ignore me' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'First reply' }] } },
    { type: 'result', result: 'Final reply' },
  ]);

  expect(extractResultText(raw)).toBe('Final reply');
});

test('extractResultText falls back to plain text output', () => {
  expect(extractResultText('plain text output')).toBe('plain text output');
});

test('extractPullRequestUrl returns the PR URL from plain gh output', () => {
  expect(
    extractPullRequestUrl('https://github.com/TencentCloudBase/CloudBase-MCP/pull/499'),
  ).toBe('https://github.com/TencentCloudBase/CloudBase-MCP/pull/499');
});

test('extractPullRequestUrl finds the first PR URL in noisy gh output', () => {
  const output = [
    'warning: something noisy on stderr',
    'https://github.com/TencentCloudBase/CloudBase-MCP/pull/499',
    'created pull request successfully',
  ].join('\n');

  expect(extractPullRequestUrl(output)).toBe(
    'https://github.com/TencentCloudBase/CloudBase-MCP/pull/499',
  );
});

test('parseIssueCommentCommand only accepts maintainer slash commands', () => {
  expect(
    parseIssueCommentCommand({
      body: '/cloudbase continue',
      authorAssociation: 'MEMBER',
      hasPullRequest: false,
    }),
  ).toEqual({ action: 'continue', command: '/cloudbase continue' });

  expect(
    parseIssueCommentCommand({
      body: '/cloudbase fix',
      authorAssociation: 'CONTRIBUTOR',
      hasPullRequest: false,
    }),
  ).toBeNull();

  expect(
    parseIssueCommentCommand({
      body: '/cloudbase skip',
      authorAssociation: 'OWNER',
      hasPullRequest: true,
    }),
  ).toBeNull();
});

test('buildAnalysisPrompt includes issue comments for continue runs', () => {
  const prompt = buildAnalysisPrompt({
    number: 488,
    title: 'MCP工具错误: writeNoSqlDatabaseStructure',
    url: 'https://github.com/TencentCloudBase/CloudBase-MCP/issues/488',
    body: '工具执行时报错。',
    labels: ['bug'],
    requestedAction: 'continue',
    command: '/cloudbase continue',
    comments: [
      {
        author: 'github-actions[bot]',
        authorAssociation: 'NONE',
        createdAt: '2026-04-09T06:59:49Z',
        body: '## 🤖 AI Analysis\n\n---\nGenerated automatically by CodeBuddy CLI headless mode.',
      },
      {
        author: 'booker',
        authorAssociation: 'MEMBER',
        createdAt: '2026-04-09T07:10:00Z',
        body: '/cloudbase continue',
      },
    ],
  });

  expect(prompt).toContain('Requested action: continue');
  expect(prompt).toContain('Issue comments:');
  expect(prompt).toContain('/cloudbase continue');
  expect(prompt).toContain('Generated automatically by CodeBuddy CLI headless mode.');
});

test('isBugIssue matches Chinese error descriptions without requiring English keywords', () => {
  expect(
    isBugIssue({
      title: 'MCP工具错误: writeNoSqlDatabaseStructure',
      body: '调用工具时直接报错，无法创建集合。',
      labels: [],
    }),
  ).toBe(true);
});

test('workflow hardens fix path with git identity and PR creation guards', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');

  expect(raw).toContain('issue_comment:');
  expect(raw).toContain('parseIssueCommentCommand');
  expect(raw).toContain('requestedAction');
  expect(raw).toContain('sync_issue_json_label');
  expect(raw).toContain('git config user.name "github-actions[bot]"');
  expect(raw).toContain('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
  expect(raw).toContain('truncate_text_for_pr_body() {');
  expect(raw).toContain('python3 -c');
  expect(raw).toContain('lookup_open_pr_url() {');
  expect(raw).toContain('write_pr_body_file() {');
  expect(raw).toContain("summary=$(printf '%s' \"$result_text\" | truncate_text_for_pr_body 12000)");
  expect(raw).toContain("pr_url=$(lookup_open_pr_url \"$branch\")");
  expect(raw).toContain("pr_url=$(printf '%s' \"$pr_output\" | node scripts/issue-auto-processor.cjs extract-pr-url || true)");
  expect(raw).toContain("fail_with_comment \"$number\" '## 🤖 AI Fix Attempt Failed' 'Automation created and pushed a fix branch, but PR creation failed before a valid PR URL could be resolved. Please inspect the workflow logs before retrying.'");
  expect(raw).toContain("fail_with_comment \"$number\" '## 🤖 AI Fix Attempt Failed' 'Automation created and pushed a fix branch, but PR creation did not return a valid URL and no open PR was found for the branch. Please inspect the workflow logs before retrying.'");
  expect(raw).toContain('pr_output=$(gh pr create --base "$DEFAULT_BRANCH" --head "$branch" --title "fix: 🤖 attempt fix for issue #$number" --body-file /tmp/pr-body.md 2>&1)');
  expect(raw).not.toContain('write_file_from_env');
  expect(raw).not.toContain('export FILE_CONTENT');
  expect(raw).not.toContain('I created a PR for this bug: $pr_url\\n\\nPlease review the generated changes before merging.');
});

test('workflow creates fix branches from the default branch baseline', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');

  expect(raw).toContain('DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}');
  expect(raw).toContain('git fetch origin "$DEFAULT_BRANCH"');
  expect(raw).toContain('git switch -C "$branch" "origin/$DEFAULT_BRANCH"');
  expect(raw).toContain('gh pr create --base "$DEFAULT_BRANCH" --head "$branch"');
});

test('workflow scheduled collection does not retry ai-failed issues automatically', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');

  expect(raw).toContain("!labels.includes('ai-failed')");
});

test('workflow isolates batch iteration from CLI stdin consumption', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');

  expect(raw).toContain('mapfile -t issues < <(jq -c ".[]" .issue-auto-processor-issues.json)');
  expect(raw).toContain('for issue in "${issues[@]}"; do');

  expect(raw).not.toContain('done < <(jq -c ".[]" .issue-auto-processor-issues.json)');
});

// `--output-format json` prints a pretty-printed array of conversation turns.
const MODEL_TRANSCRIPT_FIXTURE = JSON.stringify(
  [
    {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: '<system-reminder data-role="memory"><memory>\n# auto memory\n</memory></system-reminder>',
        },
      ],
    },
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: '## Summary\n\nFixed the launch path.' }],
    },
  ],
  null,
  2,
);

// Observed verbatim at the head of an automated PR body on the Ubuntu runner.
const RUNNER_STDERR_NOISE = 'No such schema \u201Corg.gnome.system.proxy\u201D\n';
const EXPECTED_SUMMARY = '## Summary\n\nFixed the launch path.';

test('extractResultText tolerates stderr noise captured alongside the JSON payload', () => {
  expect(extractResultText(`${RUNNER_STDERR_NOISE}${MODEL_TRANSCRIPT_FIXTURE}`)).toBe(EXPECTED_SUMMARY);

  expect(
    extractResultText(
      `${MODEL_TRANSCRIPT_FIXTURE}\n(node:3596) [DEP0040] DeprecationWarning: The \`punycode\` module is deprecated.`,
    ),
  ).toBe(EXPECTED_SUMMARY);
});

test('extractResultText picks the latest assistant turn past non-assistant records', () => {
  const raw = JSON.stringify([
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Real answer' }] },
    { type: 'message', role: 'user', content: [{ type: 'tool_result', content: 'tool output noise' }] },
  ]);

  expect(extractResultText(raw)).toBe('Real answer');
});

test('extractResultText never returns model input when only user turns carry text', () => {
  const userOnly = JSON.stringify(
    [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '# auto memory' }],
      },
    ],
    null,
    2,
  );

  expect(extractResultText(userOnly)).toBe('');
});

test('extractResultText refuses raw captures that look like a model transcript', () => {
  const truncatedFixture = MODEL_TRANSCRIPT_FIXTURE.slice(0, 400);

  expect(extractResultText(truncatedFixture)).toBe('');
  expect(extractResultText(`${RUNNER_STDERR_NOISE}${truncatedFixture}`)).toBe('');
  expect(extractResultText('<system-reminder data-role="memory">leaked</system-reminder>')).toBe('');
});

test('workflow captures CLI stdout and stderr separately so the JSON payload stays parseable', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');

  const cliInvocationLines = raw.split('\n').filter((line) => line.includes('codebuddy -p'));
  expect(cliInvocationLines.length).toBe(1);
  for (const line of cliInvocationLines) {
    expect(line).not.toContain('2>&1');
    expect(line).toContain('2>"$codebuddy_stderr_log"');
  }

  expect(raw.split('\n').filter((line) => line.includes('raw_output=$(run_codebuddy_headless)')).length).toBe(2);
  expect(raw).toContain('run_codebuddy_headless() {');
  expect(raw).toContain('report_codebuddy_stderr');
  expect(raw).toContain(
    "summary='The automated summary could not be extracted from the model output. See the workflow logs for details.'",
  );
});
