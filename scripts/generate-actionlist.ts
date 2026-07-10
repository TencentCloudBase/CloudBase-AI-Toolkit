#!/usr/bin/env npx tsx
/**
 * 从 references/ 目录提取所有 TCB API Action 列表
 * 生成 action-list.ts 文件
 */

import * as fs from 'fs';
import * as path from 'path';

const REFERENCES_DIR = path.join(__dirname, '../config/.claude/skills/cloudbase-api-direct/references');
const OUTPUT_FILE = path.join(__dirname, '../config/.claude/skills/cloudbase-api-direct/scripts/lib/src/action-list.ts');

async function extractActions(): Promise<string[]> {
  // 多种匹配模式
  const patterns = [
    /X-TC-Action:\s*(\w+)/g,                    // X-TC-Action: ActionName
    /本接口取值：(\w+)。/g,                       // 本接口取值：ActionName。
    /Action=(\w+)/g,                            // Action=ActionName (URL 参数)
  ];

  // 需要跳过的文件（非具体 API 文档）
  const skipFiles = ['README.md', 'API-概览', '公共参数'];

  // 读取并过滤文件：只处理 TCB (876) 和 CloudBase Run (1243) 文档，跳过依赖产品文档
  const files = fs.readdirSync(REFERENCES_DIR)
    .filter(f => f.endsWith('.md'))
    .filter(f => f.startsWith('876-') || f.startsWith('1243-'))
    .filter(f => !skipFiles.some(skip => f.includes(skip)));

  // 并行读取文件并提取 action
  const results = await Promise.all(
    files.map(async (file) => {
      const content = await fs.promises.readFile(path.join(REFERENCES_DIR, file), 'utf-8');
      const actions: string[] = [];

      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(content)) !== null) {
          actions.push(match[1]);
        }
      }

      return actions;
    })
  );

  // 合并去重排序
  return [...new Set(results.flat())].sort();
}

function generateFile(actions: string[]): string {
  const content = `/**
 * 自动生成的 TCB 对外 API Action 列表
 * 从 references/ 目录下的文档中提取
 *
 * ⚠️ 请勿手动编辑此文件，由 scripts/generate-actionlist.ts 自动生成
 *
 * Action 数量: ${actions.length}
 */

const TCB_ALLOWED_ACTIONS: string[] = [
${actions.map(a => `  '${a}',`).join('\n')}
];

export default TCB_ALLOWED_ACTIONS;
`;

  return content;
}

async function main() {
  console.log('📖 扫描 references 目录...');
  const actions = await extractActions();
  console.log(`✅ 提取到 ${actions.length} 个 Action`);
  
  console.log('📝 生成 action-list.ts...');
  const content = generateFile(actions);
  
  // 确保输出目录存在
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`✅ 已生成: ${OUTPUT_FILE}`);
  
  // 打印 action 列表
  console.log('\n📋 Action 列表:');
  actions.forEach(a => console.log(`  - ${a}`));
}

main();

