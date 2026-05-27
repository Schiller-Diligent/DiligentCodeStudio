# Diligent Code Studio v0.6.0 - AI Help Cleanup and Output Routing

## Purpose

This release cleans up the AI experience so the application no longer shows multiple AI Help entry points across the interface.

## Changes

- AI Help is now minimized by default.
- AI Help is opened only from the upper-right AI Help button.
- Removed the extra editor AI side panel.
- Removed the separate minimized floating AI Help tab.
- Renamed the PDF manual button to Manual to avoid confusion with AI Help.
- Split AI Help output from the main AI Coding Assistant output.
- Questions asked in AI Help now return answers inside AI Help.
- Project-aware coding actions now route to the AI Coding Assistant workspace page.
- Main coding AI output remains in the AI Coding Assistant window.
- Rebuilt the PDF manual as v0.6.0.
- Synced package, Tauri, Cargo, visible app, and manual versions to 0.6.0.

## Validation

Validated with:

```powershell
npm ci
npm run validate
npm run build
```

All checks passed.
