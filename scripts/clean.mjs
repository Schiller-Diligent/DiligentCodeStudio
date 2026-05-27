import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pathsToRemove = [
  'dist',
  '.vite',
  'coverage',
  'src-tauri/target',
];

for (const relativePath of pathsToRemove) {
  const fullPath = join(root, relativePath);
  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`Removed ${relativePath}`);
  }
}

console.log('Clean complete. Source files, docs, package manifests, and public assets were preserved.');
