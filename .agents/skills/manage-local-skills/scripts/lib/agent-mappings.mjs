import path from 'path';
import { homedir } from 'os';
import { expandHomePath } from './path-safety.mjs';

const HOME = homedir();
const CODEX_HOME = process.env.CODEX_HOME?.trim() || path.join(HOME, '.codex');
const CANONICAL_SKILLS_DIR = '.agents/skills';

export const AGENT_MAPPINGS = {
  universal: {
    key: 'universal',
    displayName: 'Universal',
    skillsDir: CANONICAL_SKILLS_DIR,
  },
  claude: {
    key: 'claude',
    displayName: 'Claude',
    skillsDir: '.claude/skills',
    globalSkillsDir: '~/.claude/skills',
  },
  'claude-code': {
    key: 'claude-code',
    displayName: 'Claude Code',
    skillsDir: '.claude/skills',
    globalSkillsDir: '~/.claude/skills',
  },
  codebuddy: {
    key: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: '~/.codebuddy/skills',
  },
  cursor: {
    key: 'cursor',
    displayName: 'Cursor',
    skillsDir: CANONICAL_SKILLS_DIR,
    globalSkillsDir: '~/.cursor/skills',
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
  return Object.keys(AGENT_MAPPINGS).filter((agentKey) => isUniversalAgent(agentKey));
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

  if (!mapping.globalSkillsDir && !mapping.universal) {
    throw new Error(`${mapping.displayName} does not support global scope`);
  }

  return expandHomePath(mapping.globalSkillsDir, HOME);
}
