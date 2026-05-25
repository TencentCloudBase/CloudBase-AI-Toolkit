const fs = require('fs');

const ALLOWED_COMMENT_AUTHOR_ASSOCIATIONS = new Set([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
]);

const BUG_LABEL_KEYWORDS = ['bug', 'error', 'crash', 'broken', 'failure', 'incident'];
const BUG_TEXT_PATTERNS = [
  /\b(bug|error|errors|crash|crashes|broken|breaks|fail|fails|failed|failing|not working)\b/i,
  /报错|错误|异常|失败|崩溃|无法|不能|不生效|有问题|未生效|失效/,
];
const GITHUB_PULL_REQUEST_URL_PATTERN = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i;

function normalizeMultilineText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\r\n/g, '\n').trim();
}

function joinTextParts(parts) {
  return parts
    .map((part) => normalizeMultilineText(part))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function extractTextFromContent(content) {
  if (typeof content === 'string') {
    return normalizeMultilineText(content);
  }

  if (Array.isArray(content)) {
    const textParts = content.flatMap((item) => {
      if (typeof item === 'string') {
        return [item];
      }

      if (!item || typeof item !== 'object') {
        return [];
      }

      if (typeof item.text === 'string') {
        return [item.text];
      }

      if (typeof item.content === 'string') {
        return [item.content];
      }

      const nested = extractTextFromParsed(item);
      return nested ? [nested] : [];
    });

    return joinTextParts(textParts);
  }

  return '';
}

function extractTextFromObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  const directCandidates = [
    value.result,
    value.text,
    value.response,
    value.output,
    value.content,
  ];

  for (const candidate of directCandidates) {
    const directText = extractTextFromContent(candidate);
    if (directText) {
      return directText;
    }
  }

  const nestedCandidates = [
    value.message,
    value.data,
    value.delta,
  ];

  for (const candidate of nestedCandidates) {
    const nestedText = extractTextFromParsed(candidate);
    if (nestedText) {
      return nestedText;
    }
  }

  return '';
}

function extractTextFromParsed(value) {
  if (typeof value === 'string') {
    return normalizeMultilineText(value);
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const candidate = extractTextFromParsed(value[index]);
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }

  return extractTextFromObject(value);
}

function tryParseStructuredOutput(rawOutput) {
  const trimmed = normalizeMultilineText(rawOutput);
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    const parsedLines = [];
    for (const line of lines) {
      try {
        parsedLines.push(JSON.parse(line));
      } catch {
        return null;
      }
    }

    return parsedLines;
  }
}

function extractResultText(rawOutput) {
  const parsed = tryParseStructuredOutput(rawOutput);
  if (parsed !== null) {
    return extractTextFromParsed(parsed);
  }

  return normalizeMultilineText(rawOutput);
}

function extractPullRequestUrl(rawOutput) {
  const normalized = normalizeMultilineText(rawOutput);
  if (!normalized) {
    return '';
  }

  const match = normalized.match(GITHUB_PULL_REQUEST_URL_PATTERN);
  return match ? match[0] : '';
}

function parseIssueCommentCommand({ body, authorAssociation, hasPullRequest }) {
  if (hasPullRequest) {
    return null;
  }

  if (!ALLOWED_COMMENT_AUTHOR_ASSOCIATIONS.has(authorAssociation)) {
    return null;
  }

  const match = String(body || '').match(/^\s*(\/cloudbase\s+(fix|skip|continue))\b/im);
  if (!match) {
    return null;
  }

  return {
    action: match[2].toLowerCase(),
    command: match[1].trim().toLowerCase(),
  };
}

function formatIssueComments(comments = []) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return '(none)';
  }

  return comments
    .map((comment, index) => {
      const author = comment.author || 'unknown';
      const association = comment.authorAssociation || 'NONE';
      const createdAt = comment.createdAt || 'unknown time';
      const body = normalizeMultilineText(comment.body) || '(empty comment)';
      return [
        `Comment ${index + 1} by @${author} (${association}) at ${createdAt}:`,
        body,
      ].join('\n');
    })
    .join('\n\n');
}

function isBugIssue(issue = {}) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const lowerLabels = labels
    .map((label) => (typeof label === 'string' ? label : ''))
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

  if (lowerLabels.some((label) => BUG_LABEL_KEYWORDS.includes(label))) {
    return true;
  }

  const combinedText = [issue.title, issue.body]
    .map((value) => (typeof value === 'string' ? value : ''))
    .join('\n');

  return BUG_TEXT_PATTERNS.some((pattern) => pattern.test(combinedText));
}

function buildSharedPrompt(issue = {}) {
  const labels = Array.isArray(issue.labels) && issue.labels.length > 0
    ? issue.labels.join(', ')
    : '(none)';

  const promptParts = [
    `Issue title: ${issue.title || '(untitled)'}`,
    `Issue URL: ${issue.url || '(unknown)'}`,
    `Labels: ${labels}`,
  ];

  if (issue.requestedAction) {
    promptParts.push(`Requested action: ${issue.requestedAction}`);
  }

  if (issue.command) {
    promptParts.push(`Trigger command: ${issue.command}`);
  }

  promptParts.push(
    '',
    'Issue body:',
    normalizeMultilineText(issue.body) || 'No description provided.',
    '',
    'Issue comments:',
    formatIssueComments(issue.comments),
  );

  return promptParts.join('\n');
}

function buildBugPrompt(issue = {}) {
  return [
    `You are fixing GitHub issue #${issue.number} in the CloudBase MCP repository.`,
    '',
    buildSharedPrompt(issue),
    '',
    'Requirements:',
    '1. Use the full issue thread above as the current conversation history.',
    '2. Investigate the issue and make the smallest credible fix.',
    '3. Edit files in the repository if you can produce a concrete patch.',
    '4. Do not run git commit, git push, or gh pr create. The workflow handles git operations outside of CodeBuddy.',
    '5. Keep your final response under 1200 words.',
    '6. End with a short section named "Summary" describing what you changed or why no safe patch was produced.',
  ].join('\n');
}

function buildAnalysisPrompt(issue = {}) {
  return [
    `You are analyzing GitHub issue #${issue.number} in the CloudBase MCP repository.`,
    '',
    buildSharedPrompt(issue),
    '',
    'Instructions:',
    '1. Use the full issue thread above as the current conversation history.',
    '2. If a prior AI reply was incomplete or wrong, correct it directly instead of repeating it.',
    '3. Provide a concise, actionable response in Markdown with these sections:',
    '   - Classification',
    '   - Likely area',
    '   - Suggested next step',
    '   - Open questions (optional)',
    '4. Keep the response under 800 words.',
  ].join('\n');
}

function loadIssueFromFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCli() {
  const command = process.argv[2];

  if (!command) {
    return;
  }

  if (command === 'extract-result') {
    const rawOutput = fs.readFileSync(0, 'utf8');
    process.stdout.write(extractResultText(rawOutput));
    return;
  }

  if (command === 'extract-pr-url') {
    const rawOutput = fs.readFileSync(0, 'utf8');
    process.stdout.write(extractPullRequestUrl(rawOutput));
    return;
  }

  const issueFile = process.argv[3];
  if (!issueFile) {
    throw new Error(`Missing issue JSON file for command: ${command}`);
  }

  const issue = loadIssueFromFile(issueFile);

  if (command === 'build-bug-prompt') {
    process.stdout.write(buildBugPrompt(issue));
    return;
  }

  if (command === 'build-analysis-prompt') {
    process.stdout.write(buildAnalysisPrompt(issue));
    return;
  }

  if (command === 'is-bug') {
    process.stdout.write(isBugIssue(issue) ? 'true' : 'false');
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  ALLOWED_COMMENT_AUTHOR_ASSOCIATIONS,
  buildAnalysisPrompt,
  buildBugPrompt,
  extractResultText,
  extractPullRequestUrl,
  isBugIssue,
  parseIssueCommentCommand,
};
