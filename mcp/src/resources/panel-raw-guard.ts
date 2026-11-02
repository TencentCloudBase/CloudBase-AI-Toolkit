/**
 * 面板「原始返回」折叠区的凭据护栏。
 *
 * 三块面板（`get-started` / `artifact-card` / `env-credits`）都会把整份 `tool-result` 写进
 * 折叠区。折叠区是给人看的调试口，不该成为凭据的第二个落点——`auth(get_temp_credentials)`
 * 在 `reveal` 为真时，结果里就是明文凭据。
 *
 * **判定按容器名（`credentials`），不按字段名。** 面板模板有两条由测试钉住的硬约束：
 * 不能出现 `secretId` / `secretKey` / `apiKey` / `accessKey` / `token` 这些字段名，
 * 且模板必须纯 ASCII。列字段名两条都违反，所以这里只看「有没有一个 credentials 块」。
 *
 * 扫描是**递归 + 限深**的：工具结果常见的三层包裹（`params` → `content[0].text` → JSON 字符串）
 * 都要能进得去；深度上限防环，字符串里像是 JSON 就先解析再扫。
 *
 * 两个导出必须语义一致：
 *   - `carriesCredentialBlock` 给服务端测试与宿主侧判断用；
 *   - `CREDENTIAL_GUARD_JS` 是内联进面板 `<script>` 的同一份实现（纯 ASCII、无反引号）。
 * `panel-raw-guard.test.ts` 用 vm 跑 JS 那份、跟 TS 这份逐项对比，防两边漂移。
 */

/** 嵌套深度上限：够穿过 params / content / JSON 字符串三层，又能挡住环。 */
export const CREDENTIAL_SCAN_MAX_DEPTH = 8;

/** 值里是否带凭据块。字符串会先尝试按 JSON 解析，数组与对象递归下探。 */
export function carriesCredentialBlock(value: unknown, depth = 0): boolean {
  if (value === null || value === undefined || depth > CREDENTIAL_SCAN_MAX_DEPTH) {
    return false;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 1 && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      try {
        return carriesCredentialBlock(JSON.parse(trimmed), depth + 1);
      } catch {
        return false;
      }
    }
    return false;
  }
  if (typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => carriesCredentialBlock(item, depth + 1));
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, "credentials")) {
    return true;
  }
  for (const key of Object.keys(record)) {
    if (key === "credentials") {
      continue;
    }
    if (carriesCredentialBlock(record[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * 内联进面板脚本的同名函数。
 *
 * 约束：纯 ASCII、不出现反引号（外层是 TS 模板串）、不出现凭据字段名。
 * 用数组拼是为了让每一行都能被肉眼比对，而不是一坨转义。
 */
export const CREDENTIAL_GUARD_JS = [
  "  function carriesCredentialBlock(value, depth) {",
  "    if (depth === void 0) { depth = 0; }",
  "    if (value == null || depth > 8) { return false; }",
  '    if (typeof value === "string") {',
  "      var trimmed = value.trim();",
  '      if (trimmed.length > 1 && (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[")) {',
  "        try { return carriesCredentialBlock(JSON.parse(trimmed), depth + 1); }",
  "        catch (err) { return false; }",
  "      }",
  "      return false;",
  "    }",
  '    if (typeof value !== "object") { return false; }',
  '    if (Object.prototype.toString.call(value) === "[object Array]") {',
  "      for (var index = 0; index < value.length; index++) {",
  "        if (carriesCredentialBlock(value[index], depth + 1)) { return true; }",
  "      }",
  "      return false;",
  "    }",
  '    if (Object.prototype.hasOwnProperty.call(value, "credentials")) { return true; }',
  "    for (var key in value) {",
  "      if (!Object.prototype.hasOwnProperty.call(value, key)) { continue; }",
  '      if (key === "credentials") { continue; }',
  "      if (carriesCredentialBlock(value[key], depth + 1)) { return true; }",
  "    }",
  "    return false;",
  "  }",
].join("\n");
