# Changelog

## v0.3.9

- App window now opens maximized by default while keeping normal window controls available.
- Added Windows minimized development launcher: `Start-DiligentCodeStudio-Dev-Minimized.cmd`.
- Added normal Windows development launcher: `Start-DiligentCodeStudio-Dev.cmd`.
- Added PowerShell launch script with log output under `logs/dev-launch.log`.


## v0.3.9

- Combined the separate Find and Search workspace pages into one compact **Find/Search** page.
- Added mode tabs for **Current File** and **Workspace** search.
- Reduced top navigation clutter by removing one workspace page button.
- Kept all existing Find / Replace and Search Across Files functionality.

# Changelog

## 0.3.6

- Added verbose heartbeat/progress logging for Terminal commands, Diagnostics, and Release Builder tasks.
- Added auto-scroll behavior for Release and Diagnostics output panels.
- Added `BUILD_ALL_OS_PACKAGES.md` with Windows, macOS, and Linux packaging guidance.
- Updated GitHub Actions workflow to upload platform bundle artifacts.
- Added helper script `scripts/Trigger-CrossPlatformBuild.ps1` for tag-triggered package builds.
- Added platform detection for Windows, Linux, and macOS.
- Added platform information to the Tools page.
- Added OS-aware npm command handling.
- Added Auto, PowerShell, Command Prompt, bash, and zsh terminal shell options.
- Added cross-platform folder opening using Explorer, Finder/open, or xdg-open.
- Added Linux/macOS ZIP package fallback using the zip command.
- Added starter GitHub Actions workflow for cross-platform builds.
- Updated Tauri config to use cross-platform npm commands.

## 0.3.4

- Moved Language Support into a slimmer vertical section under Security Status.
- Reduced Language Support width while giving it more vertical room.
- Kept Project Detection and Tool Check prominent in the left column.
- Made Security Status more compact for the narrower right column.
- Improved Tools page usability in normal, non-fullscreen windows.

## 0.3.2

- Tightened the Project / Tools page layout.
- Moved Tool Check directly under Project Detection.
- Reduced card padding and spacing on the Tools page.
- Kept Language Support, Security Status, and Active File Hash available without crowding the Project Detection column.

## 0.3.1

- Tightened the top toolbar action buttons.
- Shortened the SHA-256 toolbar label to SHA while keeping the full tooltip.
- Reduced padding, icon size, and button height for Save, Save As, Format, and SHA.
- Improved smaller-window toolbar fit so these actions are easier to see without horizontal scrolling.

## 0.3.0

- Added Extension / Tools Registry page.
- Added built-in command registry for Git, npm, Tauri, Cargo, .NET, workspace, and release-helper actions.
- Added custom tool creation, category filtering, command copy, run, disable, and remove controls.
- Registry settings persist locally in the browser/WebView storage.

## 0.2.9

### Added

- Project Templates page.
- New Project Wizard.
- Backend template creation command.
- Starter templates for Blank Project, PowerShell Tool, C# Console App, Tauri App, Web Project, Diligent Release Package, and README + LICENSE Starter.
- Template contents preview.
- Last created project summary.
- Open created project workflow.

### Changed

- Updated editor welcome text for v0.2.9.
- Added Project Templates to the security/status feature list.
