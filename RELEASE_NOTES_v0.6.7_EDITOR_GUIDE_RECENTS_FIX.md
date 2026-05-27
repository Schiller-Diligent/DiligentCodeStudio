# Diligent Code Studio v0.6.7 - Editor Guide/Recents Layout Fix

## Summary
This release fixes the Editor page layout so the Guide Me panel and Recent Files area no longer collide when no file is open.

## Changes
- Updated the main workspace grid to reserve separate rows for the top Workspace Menu, Guide panel, and active page content.
- Adjusted the Editor no-file state so the welcome card and Recent Files list scroll inside the Editor content area instead of competing with the guide panel.
- Added compact-height safeguards so the Guide panel and Recent Files area stay usable on shorter screens.
- Synced app, package, Tauri, Cargo, and manual versions to 0.6.7.

## Validation
- npm ci
- npm run validate
- npm run build
