/**
 * cbc --model 带 -ioa 的是内网通道标识。
 * 实验和 result.json 只用标准模型名，调用时再映射回去。
 * hy4 免费，用来把流程跑通。
 */
const CBC_MODEL_IDS: Record<string, string> = {
  hy4: 'hy4-preview-ioa',
  hy3: 'hy3-ioa',
  'glm-5.2': 'glm-5.2-ioa',
  'glm-5.3': 'glm-5.3-ioa',
  'kimi-k3': 'kimi-k3-ioa',
  'minimax-m3': 'minimax-m3-ioa',
  'deepseek-v4-pro': 'deepseek-v4-pro-ioa',
};

export function toCbcModelId(canonical: string): string {
  const id = CBC_MODEL_IDS[canonical];
  if (!id) {
    throw new Error(
      `Unknown model "${canonical}". Known: ${Object.keys(CBC_MODEL_IDS).join(', ')}`,
    );
  }
  return id;
}

export function toCanonicalModelId(providerModelId: string): string {
  const found = Object.entries(CBC_MODEL_IDS).find(([, id]) => id === providerModelId);
  if (!found) {
    throw new Error(`No canonical name for cbc model "${providerModelId}"`);
  }
  return found[0];
}
