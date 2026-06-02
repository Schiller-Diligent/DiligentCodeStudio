# Diligent Code Studio v0.8.0

Diligent Code Studio is a local-first desktop code editor and AI-assisted development workbench built with React, Vite, TypeScript, Tauri, and Rust.

Version **0.7.0-dev** starts the First Run Setup Wizard improvement track. The clean **v0.8.0** release remains the stable baseline; develop this branch until npm, Rust, Tauri, and installer checks pass.

## What is included

- React/Vite frontend source under `src/`
- Tauri/Rust desktop backend under `src-tauri/`
- Current bundled user manual under `public/manuals/`
- Source documentation under `docs/`
- Quality, smoke, unit, and security test scripts under `scripts/`
- GitHub Actions workflow under `.github/workflows/quality-build.yml`

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
- Operator/user manual: `docs/manuals/Diligent_Code_Studio_v0.8.0_Operator_User_Manual.pdf`
- v0.8.0 wizard plan: `FIRST_RUN_SETUP_WIZARD_v0.8.0.md`
- Security notes: `SECURITY.md`
- Testing guide: `docs/TESTING_AND_SECURITY.md`
- Open-source acknowledgments: `docs/OPEN_SOURCE_CREDITS.md`

## GitHub Actions

- `.github/workflows/quality-build.yml` runs the quality gate on push, pull request, or manual dispatch.
- `.github/workflows/release-build.yml` can be run manually to build Windows installers, create `checksums.txt`, and upload release artifacts.

## Release notes

The current v0.8.0 notes remain at the repository root. v0.8.0 remains the clean stable baseline, and older release/validation notes are kept under `docs/archive/` when possible.
