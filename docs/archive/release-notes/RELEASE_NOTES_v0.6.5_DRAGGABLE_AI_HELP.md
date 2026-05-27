# Diligent Code Studio v0.6.5 - Draggable AI Help

## Summary
Version 0.6.5 keeps the AI Help entry point in the upper-right corner, keeps AI Help minimized by default, and makes the opened AI Help panel draggable so the user can move it away from the current work area.

## Changes
- AI Help now opens as a movable floating panel.
- The AI Help header acts as a drag handle.
- The panel position is saved in local storage and restored the next time AI Help is opened.
- Added a reset-position button inside the AI Help header.
- Retained the existing AI output behavior:
  - AI Help questions answer inside AI Help.
  - Full coding/project-aware output stays in the AI Coding Assistant workspace unless asked from AI Help.
- Updated the cumulative PDF manual with a v0.6.5 addendum.
- Synced package, Tauri, Cargo, visible app, and manual versions to 0.6.5.

## Validation
- `npm ci`
- `npm run validate`
- `npm run build`

Rust/Tauri native build must still be validated on a Windows machine with Rust/Cargo installed:

```powershell
npm run check:rust
npm run tauri:build
```
