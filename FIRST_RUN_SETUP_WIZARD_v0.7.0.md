# Diligent Code Studio v0.7.0-dev — First Run Setup Wizard

This development branch starts the next-level onboarding work for Diligent Code Studio.

## Goal

Turn the existing welcome overlay into a practical first-run setup wizard that helps a new user prepare the app before editing, building, or releasing a project.

## v0.7.0-dev foundation included

- Renames the welcome overlay to **First Run Setup Wizard**.
- Adds four first-run setup decisions:
  1. Interface mode: Beginner or Advanced.
  2. Dependency check entry point.
  3. AI provider preference: Ollama, OpenAI, or Disabled.
  4. Default workspace path.
- Keeps the workspace action cards for common starting tasks.
- Keeps the Manual button as the documentation entry point.
- Keeps the Setup page as the dependency installer/checker.
- Avoids restoring the removed Guide Me button or the duplicate on-page guide card.

## Intended next improvements

- Add a completion/status indicator for each setup step.
- Add a first-run checklist summary to Start Here.
- Add a dedicated "Check setup now" action inside the wizard without closing it.
- Add workspace folder picker support inside the wizard.
- Add AI connection test support for Ollama/OpenAI during first run.
- Add a "Do not show this again" / "Reset first-run wizard" preference.

## Safety notes

This branch should remain a development branch until the normal npm, Rust, and Tauri checks pass.

Recommended validation:

```powershell
npm ci
npm run quality
npm run check:rust
npm run test:rust
npm run tauri:build
```
