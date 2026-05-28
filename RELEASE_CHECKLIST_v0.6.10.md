# Release Checklist - Diligent Code Studio v0.7.0-dev

Use this checklist before publishing a GitHub Release or uploading installers to the website.

## 1. Clean generated output

```powershell
npm run clean
```

## 2. Install locked dependencies

```powershell
npm ci
```

## 3. Run JavaScript/TypeScript quality checks

```powershell
npm run quality
```

## 4. Run Rust/Tauri checks

```powershell
npm run check:rust
npm run test:rust
```

## 5. Build native packages

```powershell
npm run tauri:build
```

## 6. Create checksums

From the folder that contains the final installers:

```powershell
Get-FileHash .\* -Algorithm SHA256 | Format-Table Algorithm, Hash, Path -AutoSize
```

For release uploads, save the hash output as `checksums.txt`.

## 7. Publish release assets

Recommended v0.7.0-dev release assets:

- Windows MSI installer
- Windows setup EXE
- Linux AppImage, `.deb`, or `.tar.gz` when built
- `checksums.txt`
- Current operator/user manual PDF
- Release notes
