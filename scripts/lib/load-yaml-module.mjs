import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export async function loadYamlModule(rootDir) {
  try {
    return (await import('js-yaml')).default;
  } catch (error) {
    const fallbackPath = path.join(rootDir, 'mcp', 'node_modules', 'js-yaml', 'index.js');
    if (fs.existsSync(fallbackPath)) {
      return (await import(pathToFileURL(fallbackPath).href)).default;
    }
    throw error;
  }
}
