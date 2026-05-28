# Diligent Code Studio v0.7.0-dev - NPM Audit Fix

Version 0.6.10 resolves the npm audit failure caused by Monaco Editor pulling in a vulnerable DOMPurify dependency chain.

## Changes

- Pinned `monaco-editor` to `0.53.0`, matching the safe npm audit remediation path.
- Regenerated `package-lock.json` so DOMPurify is no longer installed through Monaco Editor.
- Added a root `.gitignore` to keep generated build folders and packaged artifacts out of GitHub.
- Synced visible app, package, Tauri, Cargo, and manual references to `0.6.10`.

## Validation

Validated with:

```powershell
npm ci
npm run validate
npm run build
npm run audit:npm
```

Result: `npm audit --audit-level=moderate` reports 0 vulnerabilities.
