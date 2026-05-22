# Cross-Platform Notes

Diligent Code Studio v0.3.6 begins the cross-platform foundation for Windows, Linux, and macOS.

## What is platform-aware now

- Platform detection is available on the Tools page.
- Terminal shell handling supports Auto, Windows PowerShell, PowerShell 7, Command Prompt, bash, and zsh.
- npm commands use `npm.cmd` on Windows and `npm` on Linux/macOS.
- Folder opening uses Windows Explorer, macOS `open`, or Linux `xdg-open`.
- Release packaging can use PowerShell `Compress-Archive` on Windows or the `zip` command on Linux/macOS.
- A starter GitHub Actions workflow is included at `.github/workflows/build-cross-platform.yml`.

## Build notes

The most reliable way to produce installers is to build each platform on that platform:

- Windows runner or Windows PC for Windows bundles.
- macOS runner or Mac for macOS bundles.
- Linux runner or Linux PC for Linux bundles.

## Windows note

The root Tauri config now uses `npm run dev` / `npm run build` for cross-platform compatibility. If PowerShell execution policy blocks `npm`, run through `npm.cmd` manually or use a terminal policy that allows npm scripts.
