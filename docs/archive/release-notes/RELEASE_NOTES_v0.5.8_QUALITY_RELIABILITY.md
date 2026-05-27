# Diligent Code Studio v0.5.8 - Quality + Reliability Upgrade

This release turns the AI quality recommendations into practical project improvements.

## Added

- Added `npm run typecheck` to validate both app source and `vite.config.ts`.
- Added `tsconfig.node.json` for Vite configuration type checking.
- Added `npm run test` with a built-in smoke test for required files and version sync.
- Added `npm run validate` to run type checking and smoke testing together.
- Added `npm run audit:npm` for npm security review.
- Added `npm run check:rust` for Rust/Tauri compile validation on machines with Rust installed.
- Added `.editorconfig`, `.prettierrc.json`, and `.prettierignore` for consistent formatting conventions.
- Added `.github/workflows/quality-build.yml` with npm cache and Rust target cache support.

## Changed

- Bumped app metadata to v0.5.8 across package, Tauri, Cargo, visible app labels, and the built-in PDF manual.
- Updated the built-in PDF user manual to v0.5.8 with the new quality/reliability commands.
- Updated Vite production build settings for explicit minification, CSS minification, compressed-size reporting, and chunk splitting for React and Monaco.
- Improved Rust/Tauri file operation error messages with path-aware error details.
- Changed the Tauri startup entry point to report startup errors through a controlled error path instead of a panic-style `.expect(...)` call.

## Validation

Validated successfully with:

```powershell
npm ci
npm run validate
npm run build
npm run test
```

Rust native validation still requires Rust/Cargo on the target machine:

```powershell
npm run check:rust
npm run tauri:build
```
