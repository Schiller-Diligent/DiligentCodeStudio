import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'target', 'bundle', 'releases']);
const ignoredFiles = new Set(['package-lock.json']);
const findings = [];

const suspiciousPatterns = [
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: 'OpenAI API key', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/ },
];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const rel = relative(root, path).replaceAll('\\\\', '/');
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (ignoredDirectories.has(entry)) continue;
      walk(path);
      continue;
    }

    if (ignoredFiles.has(entry)) continue;
    if (stat.size > 1024 * 1024) continue;
    if (/\.(png|ico|pdf|zip|exe|dll|pdb)$/i.test(entry)) continue;

    const text = readFileSync(path, 'utf8');
    for (const pattern of suspiciousPatterns) {
      if (pattern.regex.test(text)) {
        findings.push(`${rel}: possible ${pattern.name}`);
      }
    }
  }
}

walk(root);

if (findings.length > 0) {
  console.error('Security check failed: possible secrets found.');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Security check passed: no obvious hardcoded secrets were found.');
