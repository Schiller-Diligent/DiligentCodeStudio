# Diligent Code Studio Community Edition

Diligent Code Studio is a local-first, open-source software-building workbench for editing, searching, building, packaging, and releasing software projects.

## Version

0.3.9

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


## v0.3.9 Verbose Progress + Cross-Platform Package Guidance

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


### v0.3.9 UI cleanup

Find and Search now share one workspace page with Current File and Workspace modes.


## Windows development launchers

For normal command-line development, run:

```powershell
npm.cmd run tauri:dev
```

If you want the npm/PowerShell console minimized while testing on Windows, double-click:

```text
Start-DiligentCodeStudio-Dev-Minimized.cmd
```

The packaged release build does not require an npm console window. The console window only appears when running the app in development mode.


## AI Coding Assistant

Version 0.4.0 adds an optional AI Coding Assistant foundation. AI is disabled by default. Configure OpenAI or Ollama from Settings, then use the AI page to ask questions about selected code, the active file, diagnostics, terminal output, or Git status.

Privacy notes:

- AI is optional and must be configured before use.
- Confirmation before sending context is enabled by default.
- OpenAI mode sends selected context to the OpenAI API.
- Ollama mode uses a local endpoint such as `http://127.0.0.1:11434`.
- `.aiignore` is included for future multi-file AI context filtering.


## AI Code Actions

Diligent Code Studio v0.4.2 adds optional AI Code Actions for explaining selections, reviewing the current file, fixing diagnostics, explaining terminal output, generating commit messages, suggesting refactors, creating comments, and suggesting tests. AI remains disabled by default and requires provider configuration before code/context is sent.



## v0.4.4 AI editor dock

The AI Assistant now opens by default on the Editor page and can be hidden or shown with the top toolbar **Show AI / Hide AI** button. The dock is visible even before a file is opened so users can test AI setup, copy/paste responses, and keep coding context beside the editor.

## v0.4.2 AI usability notes

- Ollama users can refresh local models and choose from a dropdown in Settings.
- The Editor page includes a docked AI panel for easier copy, paste, insert, and comment workflows.
- Ollama should be running locally before refreshing models. The default endpoint is `http://127.0.0.1:11434`.


## v0.4.4 Dependency Setup Center

This version adds a Setup page that lists required and optional dependencies, checks installed versions, provides Open Website links, and offers guarded installer buttons where supported.
