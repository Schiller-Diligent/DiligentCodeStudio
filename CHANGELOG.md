# Changelog



## v0.7.0-dev — First Run Setup Wizard Foundation

- Started the First Run Setup Wizard track.
- Converted the first-run overlay from a basic welcome chooser into a setup-oriented wizard.
- Added interface mode, dependency setup, AI provider, and default workspace path decisions to first launch.
- Preserved the streamlined v0.6.10 UI cleanup: no top Guide Me button and no duplicate on-page guide card.
- Added v0.7.0-dev planning and release-note documents.

## v0.6.10 - Final UI, Manual, and CI Update

- Removed the top toolbar **Guide Me** button.
- Kept **Manual**, **Setup**, and **AI Help** as the primary top toolbar actions.
- Retained the prior cleanup that removed the duplicated on-page **What this page does** / **Guide Me** guidance area.
- Replaced the bundled in-app PDF with **Diligent Code Studio v0.6.10 Operator/User Manual Revision 1.1**.
- Retained the GitHub Actions npm registry/retry hardening for `npm ci`.

## v0.6.10 - NPM Audit Fix and Source Package Cleanup

- Pinned `monaco-editor` to `0.53.0` to avoid the vulnerable DOMPurify dependency chain reported through newer Monaco builds.
- Regenerated `package-lock.json` and verified `npm audit --audit-level=moderate` reports 0 vulnerabilities.
- Confirmed `npm run validate` and `npm run build` complete successfully.
- Synced visible app, package, Tauri, Cargo, and manual references to `0.6.10`.
- Cleaned source-package organization by excluding generated build output and moving older release/validation notes into `docs/archive/`.

## v0.6.9 - Menu Space Cleanup

- Removed duplicate Setup & Dependencies entry from the Workspace Menu.
- Kept Setup & Dependencies available in the top-right controls.
- Improved workspace navigation spacing so primary one-line menu items have more room.

## v0.6.8 - Open Source Credits

- Added open-source acknowledgment guidance and related documentation.
- Added maintenance reminders for keeping license and third-party notice information aligned with releases.

## v0.6.7 - Editor Guide and Recents Fix

- Improved editor guide/recents behavior.
- Continued guide panel consistency work across workspace pages.

## v0.6.6 - Consistent Guide Panels

- Improved consistent guide panels across the application.

## v0.6.5 - Draggable AI Help

- Added movable AI Help guidance behavior.
- Preserved confirmation-before-send behavior for AI context workflows.

## v0.6.4 - Guided Onboarding

- Added first-run welcome/onboarding guidance.
- Added Start Here and guide-panel improvements for new users.

## v0.6.3 - Rust Template Build Fix

- Fixed Rust/Tauri build failure caused by a static website template raw-string issue.

## v0.6.2 - Web Builder and Hosting Tools

- Added Web Builder workflow support and hosting/deployment guidance.

## v0.6.1 - Cumulative Manual Policy

- Standardized stable in-app manual path: `/manuals/DiligentCodeStudio_UserManual.pdf`.
- Kept versioned cumulative manuals as archived documentation.

## v0.6.0 - AI Help Cleanup

- Cleaned AI help wording and project-aware guidance.

## Earlier history

Older detailed release notes and validation files are archived under `docs/archive/`.
