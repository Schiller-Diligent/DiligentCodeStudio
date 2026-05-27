import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));

test('project metadata versions stay synchronized', () => {
  const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'));
  const cargoToml = read('src-tauri/Cargo.toml');
  assert.equal(tauriConfig.version, packageJson.version);
  assert.match(cargoToml, new RegExp(`version = "${packageJson.version.replaceAll('.', '\\.') }"`));
});

test('cumulative PDF manual is bundled for app and source users', () => {
  const stableManual = 'DiligentCodeStudio_UserManual.pdf';
  const versionedManual = `DiligentCodeStudio_UserManual_v${packageJson.version}.pdf`;
  const cumulativeManual = `DiligentCodeStudio_UserManual_v${packageJson.version}_Cumulative.pdf`;

  assert.ok(existsSync(join(root, 'public', 'manuals', stableManual)), `missing public/manuals/${stableManual}`);
  assert.ok(existsSync(join(root, 'docs', stableManual)), `missing docs/${stableManual}`);
  assert.ok(existsSync(join(root, 'public', 'manuals', versionedManual)) || existsSync(join(root, 'public', 'manuals', cumulativeManual)), `missing public/manuals versioned cumulative manual for v${packageJson.version}`);
  assert.ok(existsSync(join(root, 'docs', versionedManual)) || existsSync(join(root, 'docs', cumulativeManual)) || existsSync(join(root, 'docs', 'manuals', cumulativeManual)), `missing docs versioned cumulative manual for v${packageJson.version}`);
  assert.ok(read('src/App.tsx').includes(`/manuals/${stableManual}`), 'App manual path should use the stable cumulative manual file');
});

test('OpenAI API keys are not persisted in saved preferences', () => {
  const appSource = read('src/App.tsx');
  assert.ok(appSource.includes('redactSensitivePreferences'), 'missing preference redaction helper');
  assert.ok(appSource.includes('aiOpenAiApiKey: \'\''), 'API key must be blanked before save/load persistence');
});

test('AI ignore list excludes common secrets and generated folders', () => {
  const aiIgnore = read('.aiignore');
  for (const pattern of ['.env', '*.pem', '*.key', 'secrets.json', 'node_modules/', 'src-tauri/target/']) {
    assert.ok(aiIgnore.includes(pattern), `.aiignore should include ${pattern}`);
  }
});

test('Rust backend includes terminal command input validation and tests', () => {
  const main = read('src-tauri/src/main.rs');
  assert.ok(main.includes('validate_terminal_command'), 'missing validate_terminal_command');
  assert.ok(main.includes('MAX_TERMINAL_COMMAND_LENGTH'), 'missing command length guard');
  assert.ok(main.includes('mod tests'), 'missing Rust unit tests module');
});
