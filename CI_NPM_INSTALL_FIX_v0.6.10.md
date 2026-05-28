# CI npm install fix â€” v0.7.0-dev

This update hardens the GitHub Actions npm install step after a failing job showed a network timeout while downloading `monaco-editor` and a Windows `EPERM` cleanup warning inside `node_modules`.

## Changes

- Added `scripts/Install-NpmDependencies.ps1`.
- Forced npm to use the public npm registry: `https://registry.npmjs.org/`.
- Added npm fetch timeout and retry settings for CI.
- Added a retry loop around `npm ci --no-audit --no-fund`.
- Added safe `node_modules` cleanup between failed attempts.
- Updated both GitHub workflows:
  - `.github/workflows/quality-build.yml`
  - `.github/workflows/release-build.yml`

## Why this matters

The failing job was not caused by application code. It was a dependency install/network reliability problem. These workflow changes make the CI process more resilient without changing the Diligent Code Studio source code.
