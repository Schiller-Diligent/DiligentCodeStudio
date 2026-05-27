# Diligent Code Studio v0.5.6 — Project-Aware AI Assistant

This release upgrades AI Help from a general coding chat into a project-aware assistant.

## Added

- New AI context mode: **Project**.
- New project-aware AI action buttons:
  - Ask AI About This Project
  - Explain Current File
  - Find Bugs
  - Improve This Code
  - Generate Missing File
  - Create README
  - Create Installer Script
  - Summarize Project
- Project context can include:
  - active screen
  - workspace path
  - detected project type
  - file/folder summary
  - active file preview
  - open file list
  - Git status
  - diagnostics summary
  - recent terminal output
  - release/build state
- Added the project-aware buttons to:
  - compact AI Help pocket
  - full AI Coding Assistant page
  - editor AI area

## Safety

AI actions prepare prompts and context but do not automatically change project files. Users still review and choose whether to Ask AI, copy, insert, or save generated output.
