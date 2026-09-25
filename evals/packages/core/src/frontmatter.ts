/**
 * PROMPT.md frontmatter。只覆盖场景文件实际用到的子集：
 * 标量、块列表、`>-` 折叠字符串。不引入 YAML 依赖。
 */

export interface FrontmatterDoc {
  [key: string]: string | boolean | string[];
}

const FOLDED = new Set(['>', '>-', '|', '|-']);

export function splitFrontmatter(markdown: string): { raw: string; body: string } {
  const text = markdown.replace(/^\uFEFF/, '');
  if (!text.startsWith('---\n')) {
    throw new Error('PROMPT.md must start with YAML frontmatter');
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('PROMPT.md frontmatter is missing the closing ---');
  }
  return {
    raw: text.slice(4, end),
    body: text.slice(end + 5).replace(/^\n/, ''),
  };
}

export function parseFrontmatter(raw: string): FrontmatterDoc {
  const doc: FrontmatterDoc = {};
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }
    const key = match[1];
    const rest = match[2];

    if (rest === '') {
      const items: string[] = [];
      i += 1;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s+/, '').trim());
        i += 1;
      }
      doc[key] = items;
      continue;
    }

    if (FOLDED.has(rest)) {
      const chunk: string[] = [];
      i += 1;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() !== '') chunk.push(lines[i].trim());
        i += 1;
      }
      doc[key] = chunk.join(rest.startsWith('>') ? ' ' : '\n');
      continue;
    }

    doc[key] = rest.replace(/^["']|["']$/g, '');
    i += 1;
  }

  return doc;
}
