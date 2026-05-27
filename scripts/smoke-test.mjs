import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'src/App.tsx',
  'src/main.tsx',
  'src/types.ts',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json',
  'src-tauri/src/main.rs',
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const cargoToml = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const appSource = readFileSync(join(root, 'src/App.tsx'), 'utf8');

if (packageJson.version !== tauriConfig.version) {
  failures.push(`Version mismatch: package.json=${packageJson.version}, tauri.conf.json=${tauriConfig.version}`);
}

if (!cargoToml.includes(`version = "${packageJson.version}"`)) {
  failures.push('Cargo.toml version does not match package.json.');
}

// v0.6.1+ manual policy: the app opens a stable cumulative manual path. Versioned PDFs are kept as archives.
if (!appSource.includes("/manuals/DiligentCodeStudio_UserManual.pdf")) {
  failures.push('App manual path should use the stable cumulative manual file.');
}

if (!existsSync(join(root, 'public/manuals/DiligentCodeStudio_UserManual.pdf'))) {
  failures.push('Missing stable cumulative user manual PDF.');
}

const versionedManualCandidates = [
  `public/manuals/DiligentCodeStudio_UserManual_v${packageJson.version}.pdf`,
  `public/manuals/DiligentCodeStudio_UserManual_v${packageJson.version}_Cumulative.pdf`,
  `docs/manuals/DiligentCodeStudio_UserManual_v${packageJson.version}_Cumulative.pdf`,
];

if (!versionedManualCandidates.some((candidate) => existsSync(join(root, candidate)))) {
  failures.push(`Missing versioned/cumulative user manual archive for v${packageJson.version}.`);
}

if (failures.length > 0) {
  console.error('Smoke test failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Smoke test passed for Diligent Code Studio v${packageJson.version}.`);
