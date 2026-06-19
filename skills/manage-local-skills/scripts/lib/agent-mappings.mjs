import path from 'path';
import { homedir } from 'os';
import { expandHomePath } from './path-safety.mjs';

const HOME = homedir();
const CONFIG_HOME = process.env.XDG_CONFIG_HOME?.trim() || path.join(HOME, '.config');
const CODEX_HOME = process.env.CODEX_HOME?.trim() || path.join(HOME, '.codex');
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(HOME, '.claude');
const CANONICAL_SKILLS_DIR = '.agents/skills';

export const AGENT_MAPPINGS = {
  universal: {
    key: 'universal',
    displayName: 'Universal',
    skillsDir: CANONICAL_SKILLS_DIR,
    globalSkillsDir: path.join(CONFIG_HOME, 'agents/skills'),
    showInUniversalList: false,
  },
  claude: {
    key: 'claude',
    displayName: 'Claude',
    skillsDir: '.claude/skills',
    globalSkillsDir: path.join(CLAUDE_HOME, 'skills'),
  },
  'claude-code': {
    key: 'claude-code',
    displayName: 'Claude Code',
    skillsDir: '.claude/skills',
    globalSkillsDir: path.join(CLAUDE_HOME, 'skills'),
  },
  codebuddy: {
    key: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: path.join(HOME, '.codebuddy/skills'),
  },
  cursor: {
    key: 'cursor',
    displayName: 'Cursor',
    skillsDir: CANONICAL_SKILLS_DIR,
    globalSkillsDir: path.join(HOME, '.cursor/skills'),
  },
  codex: {
    key: 'codex',
    displayName: 'Codex',
    skillsDir: CANONICAL_SKILLS_DIR,
    globalSkillsDir: path.join(CODEX_HOME, 'skills'),
  },
};

export function getAgentMapping(agentKey) {
  const mapping = AGENT_MAPPINGS[agentKey];
  if (!mapping) {
    throw new Error(`Unsupported agent: ${agentKey}`);
  }
  return mapping;
}

export function listAgentMappings() {
  return Object.values(AGENT_MAPPINGS).map((mapping) => ({ ...mapping }));
}

export function isUniversalAgent(agentKey) {
  return getAgentMapping(agentKey).skillsDir === CANONICAL_SKILLS_DIR;
}

export function getUniversalAgents() {
  return Object.entries(AGENT_MAPPINGS)
    .filter(([, mapping]) => mapping.skillsDir === CANONICAL_SKILLS_DIR && mapping.showInUniversalList !== false)
    .map(([agentKey]) => agentKey);
}

export function resolveAgentBaseDir(agentKey, scope, cwd) {
  const mapping = getAgentMapping(agentKey);

  if (isUniversalAgent(agentKey)) {
    return scope === 'global'
      ? path.join(HOME, '.agents', 'skills')
      : path.join(cwd, CANONICAL_SKILLS_DIR);
  }

  if (scope === 'project') {
    return path.join(cwd, mapping.skillsDir);
  }

  if (!mapping.globalSkillsDir) {
    throw new Error(`${mapping.displayName} does not support global scope`);
  }

  return expandHomePath(mapping.globalSkillsDir, HOME);
}
