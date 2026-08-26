# Diligent Code Studio

**Diligent Software Services**  
Latest stable release: **v0.9.0**

Diligent Code Studio is a local-first desktop code editor and AI-assisted development workbench built with React, Vite, TypeScript, Tauri, and Rust.

Diligent Code Studio is part of the Diligent Software Services product suite. Product documentation, installers, application identity, and release metadata should use the official Diligent Software Services branding standard. The compact application identity uses the official circuit-**D** mark; larger documentation and product surfaces use the full Diligent Software Services identity where appropriate.

## Current stable release

Version **0.9.0** is the current stable release. The v0.9.0 release includes validated Windows MSI and NSIS installers and SHA-256 checksums published through GitHub Releases.

Development work on `main` may move beyond the stable release. A newer development commit does not become a stable release until its version metadata, validation gates, native packages, checksums, and GitHub Release are completed together.

## What is included

- React/Vite frontend source under `src/`
- Tauri/Rust desktop backend under `src-tauri/`
- Current bundled user manual under `public/manuals/`
- Source documentation under `docs/`
- Quality, smoke, unit, and security test scripts under `scripts/`
- GitHub Actions quality and release workflows under `.github/workflows/`

Generated folders such as `dist/`, `node_modules/`, and `src-tauri/target/` are intentionally excluded from the clean source package.

## Requirements

- Node.js 22.x LTS or newer compatible release
- npm
- Rust/Cargo for native Tauri builds
- Tauri system prerequisites for the target operating system

## Developer quick start

```powershell
npm ci
npm run validate
npm run build
npm run audit:npm
```

Run the desktop development build:

```powershell
npm run tauri:dev
```

Build the native desktop packages:

```powershell
npm run tauri:build
```

Run the full release gate on a machine with Rust/Cargo installed:

```powershell
npm run release:check
```

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts the Vite development server for Tauri. |
| `npm run build` | Type-checks and builds the frontend. |
| `npm run validate` | Runs TypeScript, smoke, unit, and security tests. |
| `npm run audit:npm` | Runs npm audit at moderate severity or higher. |
| `npm run quality` | Runs validate, build, and npm audit together. |
| `npm run clean` | Removes generated frontend/Rust build folders. |
| `npm run tauri:build` | Builds native Tauri desktop installers/packages. |

## Documentation

- Current in-app manual: `public/manuals/DiligentCodeStudio_UserManual.pdf`
- Source manual copy: `docs/DiligentCodeStudio_UserManual.pdf`
- Security notes: `SECURITY.md`
- Testing guide: `docs/TESTING_AND_SECURITY.md`
- Open-source acknowledgments: `docs/OPEN_SOURCE_CREDITS.md`
- Older release and planning material is retained under the repository documentation/archive structure where applicable.

## GitHub Actions

- `.github/workflows/quality-build.yml` runs the quality gate on push, pull request, or manual dispatch.
- `.github/workflows/release-build.yml` builds and validates native release artifacts according to the release workflow.

## Release discipline

A Diligent Code Studio release is considered current only when the source version, Tauri/Cargo/package metadata, build outputs, checksums, and GitHub Release agree. Historical releases remain available for traceability and are not overwritten.

## Diligent Software Services

Official product site: https://diligentsoftwareservices.com/
