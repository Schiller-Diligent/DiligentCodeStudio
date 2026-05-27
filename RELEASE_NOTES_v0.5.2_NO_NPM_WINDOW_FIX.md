# Diligent Code Studio v0.5.2 - No npm Window Fix

This maintenance build is focused on installed-app behavior on Windows.

## Fixed

- Added the Windows GUI subsystem attribute to the Tauri/Rust entry point so release builds do not open a console window beside the application.
- Added a hidden command launcher for background checks so version probes such as `node --version`, `npm --version`, `git --version`, `gh --version`, and installer/status checks do not open visible command windows from the installed desktop app.
- Kept the explicit **Open Terminal** action unchanged. When the user clicks Open Terminal, a terminal window is still intentionally opened.

## Notes

- `beforeDevCommand: npm run dev` remains in `tauri.conf.json` because Tauri uses it only for development mode. It should not run when launching the installed production app.
- If an npm window still opens after this build, check the Windows shortcut target. It should point to `Diligent Code Studio.exe`, not `npm`, `node`, or `Start-DiligentCodeStudio-Dev.cmd`.
