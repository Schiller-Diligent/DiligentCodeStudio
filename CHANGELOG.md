## v0.6.3 - Rust Template Build Fix

- Fixed Rust/Tauri build failure caused by the Web Builder static website template raw string.
- Changed the static website HTML template in `src-tauri/src/main.rs` from a one-hash raw string to a two-hash raw string so `href="#content"` no longer terminates the Rust string early.
- Added a v0.6.3 cumulative manual addendum documenting this build fix.
- Synced visible app/package/Tauri/Cargo versions to 0.6.3.

## v0.6.2 - Web Builder + Hosting Tools

- Added dedicated Web Builder workspace page.
- Added local dev, LAN preview, production build, and production preview actions.
- Added Vercel and Netlify deployment command helpers.
- Added installable web component/tool actions.
- Added Static Website and React + Vite Website templates.
- Added Vercel CLI, Netlify CLI, and pnpm dependency checks.
- Appended v0.6.2 addendum to the cumulative PDF manual.

## v0.6.1 - Cumulative User Manual Policy

- Changed the Manual button to open a stable cumulative manual file.
- Preserved the original v0.5.5 manual pages at the front of the PDF.
- Appended version addenda through v0.6.1 instead of replacing the manual content.
- Added manual archives under docs/manuals.
- Synced visible UI, package, Tauri, Cargo, and manual references to 0.6.1.

## v0.5.6 - Help Button and Built-in PDF User Manual

- Added a Help button in the top-right app bar.
- Added a built-in PDF User Manual viewer inside the application.
- Added the user manual PDF under public/manuals for bundled app access.
- Added a copy of the manual under docs for source package access.
- Bumped package, Tauri, and Cargo versions to 0.5.6.

# Changelog

## v0.5.4 - Cleaner Screen Layout

- Removed the always-open global Terminal/Workbench panel from every screen.
- Kept Terminal access on the dedicated Terminal page.
- Kept Problems, Release, Logs, and AI output available in their appropriate screens.
- Preserved compact AI Help on every screen.
- Bumped package, Tauri, and Cargo versions to 0.5.4.

## v0.5.1 - Compact AI Everywhere

- Reworked the large global AI side panel into a compact floating AI helper.
- AI remains available on every screen without taking permanent workspace width.
- Added minimized AI Help button for quick access.
- Kept coding actions for Explain, Bugs, Errors, Terminal, Git, and Navigate.
- Preserved Settings access, provider status, response copy, and insert-to-editor actions.
- Restored full-width main workspace by removing the dedicated AI grid column.

## v0.5.0 - Next-Level UI + Workflow Upgrade

- Bumped app/package/Tauri/Cargo versions to 0.5.0.
- Added a professional top app bar with a project health/status strip.
- Kept the Workspace Menu in a fixed top area with no horizontal scrolling.
- Preserved direct drag-and-drop ordering for Workspace Menu buttons.
- Kept Reset Menu Order in Settings only.
- Added a global right-side AI Assistant panel available across workspace pages.
- Added AI quick actions for explaining files, finding bugs, reviewing errors, reviewing terminal output, summarizing Git status, and drafting documentation prompts.
- Added a bottom workbench panel with Terminal, Problems, Output, Build Log, and AI Log tabs.
- Renamed Setup to Setup & Dependencies.
- Renamed Registry to Tool Registry.
- Renamed Project / Tools to Project Health Dashboard.
- Added stronger visual structure around project health, setup status, Git status, and AI provider status.
- Validated the React/Vite frontend with npm ci and npm run build.


## v0.4.9 Workspace Menu No-Scroll Fix

- Moved the Workspace Menu into its own dedicated top toolbar area.
- Removed horizontal scrolling from the Workspace Menu.
- Allowed Workspace Menu buttons to wrap naturally instead of creating a scrollbar.
- Kept pointer-based drag-and-drop ordering active.
- Kept Reset Menu Order in Settings only.
- Preserved visible Workspace Menu labels at smaller widths.

## v0.4.9 - Build-Hardened Workspace Polish

- Bumped app/package/Tauri/Cargo versions to 0.4.9.
- Removed the Reset button from the top Workspace Menu; reset is now kept in Settings only.
- Replaced the toolbar button HTML5 drag/drop behavior with pointer-based drag sorting so Workspace Menu buttons can be reliably dragged left or right in the desktop app WebView.
- Added before/after drop indicators while dragging Workspace Menu buttons.
- Kept Templates as the far-left default page.
- Hardened GitHub Actions builds by using Node.js 22 LTS, npm ci, npm retry settings, and a Windows-only workflow.
- Improved Ollama detection by checking both 127.0.0.1 and localhost and recognizing a running local API even when the CLI is not on PATH.
- Preserved the Visual Studio C++ Build Tools winget "already installed / no upgrade available" handling as a successful installer result.

## v0.4.8 - Drag-and-Drop Workspace Menu

- Added drag-and-drop reordering directly on the top Workspace Menu.
- Templates remains farthest left by default.
- Removed the bulky Workspace Menu Order list from Settings.
- Added a compact Workspace Menu settings card with a Reset Menu Order button.
- Improved drag styling for active and dragged menu buttons.

## v0.4.7 - Compact Workspace Menu Order

- Made the Settings > Workspace Menu Order section smaller.
- Changed Move Left / Move Right buttons to compact arrow controls.
- Reduced menu-order row height, spacing, padding, and reset button size.
- Improved fit in normal and compact interface modes.

## v0.4.6

- Improved Visual Studio C++ Build Tools detection on Windows.
- Setup page now detects installed Build Tools even when `link.exe` is only available inside Developer PowerShell/Command Prompt.
- Installer results now treat winget “already installed / no newer package available” messages as success instead of failure.

## v0.4.5

- Improved Ollama detection in the Dependency Setup Center.
- Setup now treats Ollama as available if either the CLI is found on PATH or the local API is running at `http://127.0.0.1:11434`.
- Clarified status text when the Ollama API is running but the CLI is not visible to the app process.

## v0.4.4 - Dependency Setup Center

- Added a dedicated Setup page for dependency checking and guided installs.
- Added status cards for core development tools, optional build tools, AI tools, and packaging helpers.
- Added installer buttons for supported Windows dependencies using winget.
- Added Open Website buttons and a setup install log.
- Added clearer required vs optional dependency grouping.

## v0.4.3 - Editor AI Dock Default

- AI Assistant dock now opens on the Editor page by default.
- The top toolbar AI button now toggles Show AI / Hide AI behavior.
- The dock remains visible even before a file is open, making AI setup and copy/paste easier.
- Improved narrow-window AI dock layout so it stacks instead of disappearing.

## v0.4.2a - AI Code Actions

- Added targeted AI Code Action buttons.
- Added Explain Selection, Review File, Fix Problems, Explain Terminal, Commit Message, Refactor Selection, Generate Comments, and Suggest Tests actions.
- Added Insert as Comment for AI responses.
- Improved AI prompts to use the correct context mode automatically.
- Kept AI provider disabled by default and preserved confirmation-before-send behavior.

## 0.4.0 - AI Coding Assistant Foundation

- Added AI workspace page.
- Added optional OpenAI API provider support.
- Added optional Ollama local provider support.
- Added AI settings for provider, model, endpoint, API key, context mode, and confirmation behavior.
- Added context modes for selected/current file, Problems output, Terminal output, and Git status.
- Added copy and insert-response actions.
- Added `.aiignore` starter file for future privacy filtering.
- Regenerated package lock references to use the public npm registry.


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

## 0.4.0 - AI Coding Assistant Foundation

- Added AI workspace page.
- Added optional OpenAI API provider support.
- Added optional Ollama local provider support.
- Added AI settings for provider, model, endpoint, API key, context mode, and confirmation behavior.
- Added context modes for selected/current file, Problems output, Terminal output, and Git status.
- Added copy and insert-response actions.
- Added `.aiignore` starter file for future privacy filtering.
- Regenerated package lock references to use the public npm registry.


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
