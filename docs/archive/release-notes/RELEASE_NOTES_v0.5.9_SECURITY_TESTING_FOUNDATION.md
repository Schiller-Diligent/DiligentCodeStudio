# Diligent Code Studio v0.5.9 - Security + Testing Foundation

## Added

- Added Node built-in unit tests through `npm run test:unit`.
- Added `npm run test:security` to scan source files for obvious hardcoded secrets.
- Added `npm run test:all` and strengthened `npm run validate`.
- Added Rust unit tests for backend validation helpers.
- Added `npm run test:rust` for backend tests when Rust is installed.
- Added `docs/TESTING_AND_SECURITY.md`.
- Added `.env.example` with safe placeholders.

## Security improvements

- OpenAI API keys are now session-only and are not persisted to local preferences.
- Older saved API keys are ignored on load.
- Added stronger `.aiignore` coverage for private keys, environment files, local databases, and backups.
- Added terminal command input validation for empty, oversized, null-character, and control-character commands.

## Build/reliability improvements

- GitHub Actions now runs TypeScript validation, smoke/unit/security tests, npm audit, Cargo check, and Rust tests.
- The built-in PDF user manual was regenerated for v0.5.9.
