import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync('src/aiProviderHub.ts', 'utf8');

const requiredExports = [
  'AI_PROVIDER_HUB_VERSION',
  'DEFAULT_AI_PROVIDER_PROFILES',
  'validateProviderProfile',
  'buildAiProviderRequest',
  'extractAiProviderText',
  'testAiProviderConnection',
  'listAiProviderModels',
  'makeAiChatMessages',
];

for (const exportName of requiredExports) {
  assert.match(source, new RegExp(`export (const|function|async function) ${exportName}\\b`), `missing export ${exportName}`);
}

for (const kind of ['openai-compatible', 'ollama', 'anthropic', 'gemini', 'custom']) {
  assert.ok(source.includes(`'${kind}'`), `missing provider kind ${kind}`);
}

assert.ok(source.includes('/api/chat'), 'missing Ollama chat endpoint support');
assert.ok(source.includes('/v1/chat/completions'), 'missing OpenAI-compatible chat endpoint support');
assert.ok(source.includes('/api/tags'), 'missing Ollama model discovery endpoint support');
assert.ok(source.includes('/v1/models'), 'missing OpenAI-compatible model discovery endpoint support');
assert.ok(source.includes('maskApiKey'), 'missing API key masking helper');

console.log('AI Provider Hub foundation smoke test passed.');