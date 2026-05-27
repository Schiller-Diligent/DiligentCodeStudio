# Diligent Code Studio v0.5.3 - No Startup npm Window Fix

## Purpose
This release prevents npm/console windows from opening automatically when the installed app starts.

## Changes
- Removed automatic startup development-tool checks.
- Kept platform detection at startup because it does not launch npm.
- Development tool checks now run only when the user opens/uses Setup & Dependencies or manually refreshes tool status.
- This prevents startup checks such as `npm --version` from opening visible npm/cmd windows on some Windows systems.
- Retained the Windows GUI subsystem setting from v0.5.2.
- Retained hidden process flags for background commands.

## Notes
If a terminal opens only when using the Open Terminal button or running a command from the Terminal page, that is expected. The app should not open an npm window simply from launching the installed program.
