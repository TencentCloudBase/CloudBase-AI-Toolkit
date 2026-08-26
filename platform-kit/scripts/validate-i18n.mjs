#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");

function extractKeys(source) {
  const keys = new Set();
  const re = /^\s*"([^"]+)":/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

const en = readFileSync(join(root, "en.ts"), "utf8");
const zh = readFileSync(join(root, "zh.ts"), "utf8");
const enKeys = extractKeys(en);
const zhKeys = extractKeys(zh);

const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k));
const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k));

if (onlyEn.length || onlyZh.length) {
  console.error("i18n key mismatch:");
  if (onlyEn.length) console.error("  en only:", onlyEn.join(", "));
  if (onlyZh.length) console.error("  zh only:", onlyZh.join(", "));
  process.exit(1);
}

console.log(`i18n OK: ${enKeys.size} keys symmetric`);
