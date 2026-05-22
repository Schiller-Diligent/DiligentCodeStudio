# Diligent Code Studio Community Edition

Diligent Code Studio is a local-first, open-source software-building workbench for editing, searching, building, packaging, and releasing software projects.

## Version

0.3.7

## Highlights

- Folder picker and project explorer
- File management: new file, new folder, rename, delete, save, save as
- Monaco-based editor
- Find / Replace in current file
- Search Across Files
- Cross-platform terminal command panel
- Smart project and tool detection
- Git page
- Release Builder
- Problems / Diagnostics page
- Settings and preferences
- Language support polish
- Responsive layout improvements
- Project Templates / New Project Wizard
- Cross-platform foundation for Windows, Linux, and macOS
- Verbose progress logging for long-running terminal, diagnostics, and release tasks
- GitHub Actions workflow for Windows, macOS, and Linux package artifacts

## Run in development

```powershell
npm.cmd install
npm.cmd run tauri:dev
```

On Linux/macOS, use:

```bash
npm install
npm run tauri:dev
```

## Project Templates

Open the **Templates** page to create starter projects for:

- Blank Project
- PowerShell Tool
- C# Console App
- Tauri App
- Web Project
- Diligent Release Package
- README + LICENSE Starter

The template wizard creates a new project folder under the selected parent directory and can open the new project immediately.


## v0.3.0 Extension / Tools Registry

Adds a local registry for built-in and custom command shortcuts, including run/copy/toggle controls and category filtering.


## v0.3.4 Project / Tools Layout

The Project / Tools page now keeps Project Detection and Tool Check prominent while placing Language Support under Security Status in a slimmer, taller right column.


## v0.3.7 Verbose Progress + Cross-Platform Package Guidance

Diligent Code Studio now includes visible verbose progress output for long-running tasks and initial platform-aware behavior for Windows, Linux, and macOS:

- Platform detection on the Tools page
- OS-aware terminal shell selection
- Windows `npm.cmd` vs Linux/macOS `npm` command handling
- Cross-platform folder opening
- Cross-platform release ZIP fallback using `zip` on Linux/macOS
- Starter GitHub Actions workflow for Windows, macOS, and Linux builds
- Auto-scrolling verbose output for Terminal, Problems, and Release pages
- Heartbeat messages while long-running commands are still working

See `CROSS_PLATFORM_NOTES.md` and `BUILD_ALL_OS_PACKAGES.md` for details.


### v0.3.7 UI cleanup

Find and Search now share one workspace page with Current File and Workspace modes.
