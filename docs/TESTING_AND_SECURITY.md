# Testing and Security Guide

Diligent Code Studio v0.6.10 adds a stronger quality gate without adding extra npm dependencies.

## Recommended local checks

```powershell
npm ci
npm run validate
npm run build
npm run check:rust
```

## Test layers

- `npm run test:smoke` verifies required files, version sync, and bundled manual paths.
- `npm run test:unit` uses Node's built-in test runner for metadata, manual, AI-ignore, and security persistence checks.
- `npm run test:security` scans source files for obvious hardcoded secrets such as private keys, GitHub tokens, OpenAI keys, and AWS access keys.
- `npm run check:rust` runs Cargo compile checks for the Tauri backend when Rust is installed.
- `npm run test:rust` runs Rust unit tests when Rust is installed.

## Sensitive data rules

- OpenAI API keys are session-only and are not persisted to browser/local preferences.
- `.aiignore` excludes common secret files and generated folders from future multi-file AI context features.
- Ollama remains the preferred local-first provider for private code review.
- The app performs no telemetry or account sync.

## Storage model

Current local storage is intentionally simple:

- Preferences: local browser storage, sanitized before save.
- Tool registry: local browser storage.
- Recent files: local browser storage.
- Project files: user-selected workspace folders on disk.

Future storage options can add SQLite or encrypted OS keychain storage, but v0.6.10 avoids storing secrets until that backend is available.
