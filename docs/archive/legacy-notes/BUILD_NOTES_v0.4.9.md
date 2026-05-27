# Diligent Code Studio v0.4.9 Build Notes

This package was created from `DiligentCodeStudioStarter_v0.4.8(1).zip` and updated to v0.4.9.

## Verified here

- `npm ci` completed successfully.
- `npm run build` completed successfully after the v0.4.9 changes.

## Not verified here

The full Tauri desktop executable was not compiled in this sandbox because the Rust/Cargo toolchain is not installed here. Use either the included GitHub Actions workflow or run this locally on Windows after installing Rust/MSVC Build Tools.

## Recommended local build commands

```powershell
cd C:\DiligentProjects\DiligentCodeStudioStarter_v0.4.9
npm ci
npm run build
npm run tauri:build
```

## GitHub Actions

Use `.github/workflows/build-windows-only.yml` first for the Windows installer, then use the cross-platform workflow once Windows is passing.
