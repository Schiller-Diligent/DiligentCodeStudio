# Diligent Code Studio v0.6.4 - Guided Onboarding + User Experience Upgrade

## Added

- First-run Welcome Wizard with guided starting choices.
- New Start Here workspace page.
- Guide Me button in the upper-right toolbar.
- Screen-specific "What this page does" guidance cards.
- Beginner and Advanced guidance mode preference.
- Sample project shortcuts from Start Here.
- Cumulative manual addendum for v0.6.4.

## Improved

- New users now have a clear path for setup, opening/creating projects, web building, AI help, diagnostics, and release packaging.
- AI Help now doubles as a navigation guide when users click Guide Me.
- Advanced users can reduce guidance clutter with Advanced Mode.

## Validation

Validated with:

```powershell
npm ci
npm run validate
npm run build
```

Rust/Cargo build validation should be run locally with:

```powershell
npm run check:rust
npm run tauri:build
```
