#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadYamlModule } from './lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT_DIR, 'doc/prompts/config.yaml');
const OUTPUT_FILE = path.join(ROOT_DIR, 'doc/components/prompts.json');
const yaml = await loadYamlModule(ROOT_DIR);

/**
 * Generate prompts.json from config.yaml
 */
function generatePromptsData() {
  // Read config.yaml
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Config file not found: ${CONFIG_FILE}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
  const config = yaml.load(configContent);

  if (!config.rules || !Array.isArray(config.rules)) {
    console.error('Invalid config: rules array not found');
    process.exit(1);
  }

  // Transform to prompts data format
  const promptsData = config.rules.map(rule => ({
    id: rule.id,
    title: rule.title,
    description: rule.description,
    shortDescription: rule.shortDescription || rule.description, // Fallback to description if shortDescription not provided
    category: rule.category,
    order: rule.order,
    prompts: rule.prompts || []
  }));

  // Write JSON file
  const jsonContent = JSON.stringify(promptsData, null, 2);
  fs.writeFileSync(OUTPUT_FILE, jsonContent, 'utf8');

  console.log(`✅ Generated: ${OUTPUT_FILE}`);
  console.log(`📊 Total prompts: ${promptsData.reduce((sum, rule) => sum + rule.prompts.length, 0)}`);
}

generatePromptsData();

