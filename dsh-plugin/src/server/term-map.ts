const REGION_LABEL: Record<string, string> = {
  "ap-shanghai": "上海",
  "ap-guangzhou": "广州",
  "ap-beijing": "北京",
  "ap-chengdu": "成都",
  "ap-nanjing": "南京",
  "ap-chongqing": "重庆",
  "ap-hongkong": "中国香港",
  "ap-singapore": "新加坡",
  "ap-tokyo": "东京",
  "ap-seoul": "首尔",
  "na-siliconvalley": "硅谷",
  "na-ashburn": "弗吉尼亚",
  "eu-frankfurt": "法兰克福",
};

const USAGE_MODULE_LABEL: Record<string, string> = {
  FLEXDB: "文档型数据库",
  TDSQL: "数据库",
  SCF: "云函数",
  EKS: "云托管",
  COS: "对象存储",
  AI: "AI",
  HOSTING: "静态托管",
  Auth: "身份认证",
  APIInvocation: "API 调用",
  HTTPInvocation: "HTTP 调用",
  VM: "虚拟机",
  Workflow: "工作流",
  Other: "其他",
};

const INTERNAL_CODE_RE = /\b(FLEXDB|TDSQL|SCF|EKS)\b/g;
const INTERNAL_CODE_TEST_RE = /\b(FLEXDB|TDSQL|SCF|EKS)\b/;

export function mapUsageModule(code: string): string {
  return USAGE_MODULE_LABEL[code] ?? code;
}

export function mapRegion(code: string | undefined): string {
  if (!code) return "未知地域";
  const label = REGION_LABEL[code];
  return label ? `${label}（${code}）` : code;
}

export function scrubInternalCodes(text: string): string {
  return text.replace(INTERNAL_CODE_RE, (code) => mapUsageModule(code));
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatUsageItem(moduleCode: string, used?: string, quota?: string): {
  productName: string;
  usedLabel: string;
} {
  const productName = mapUsageModule(moduleCode);
  if (used && quota) return { productName, usedLabel: `${used} / ${quota}` };
  if (used) return { productName, usedLabel: used };
  return { productName, usedLabel: "—" };
}

export function containsInternalCode(value: unknown): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return INTERNAL_CODE_TEST_RE.test(text);
}
