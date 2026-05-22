# Build Packages for Windows, macOS, and Linux

Diligent Code Studio is a Tauri desktop app. The safest way to create installers/packages for all supported desktop operating systems is to build each package on that operating system.

## Why GitHub Actions is the recommended path

From a Windows workstation you can build the Windows package locally, but macOS packages should be built on macOS and Linux packages should be built on Linux. The included GitHub Actions workflow uses native runners for each OS:

- `windows-latest` creates Windows bundles.
- `macos-latest` creates macOS bundles.
- `ubuntu-22.04` creates Linux bundles.

Workflow file:

```text
.github/workflows/build-cross-platform.yml
```

## One-time setup

1. Create a GitHub repository.
2. Push this project to the repository.
3. Confirm GitHub Actions is enabled for the repository.

Example:

```powershell
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

## Build packages manually from GitHub

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Build Diligent Code Studio Cross-Platform**.
4. Click **Run workflow**.
5. Download the artifacts when the workflow finishes.

## Build packages by version tag

From Windows PowerShell:

```powershell
git status
git tag v0.3.6
git push origin main
git push origin v0.3.6
```

The workflow will run and produce platform artifacts.

## Local Windows-only build

From your Windows project folder:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run tauri:build
```

Windows installer artifacts are created under:

```text
src-tauri\target\release\bundle
```

## Notes

- Code signing is separate. Unsigned installers may show operating-system warnings.
- macOS distribution outside your own machine usually requires Apple signing/notarization.
- Linux package availability depends on Tauri bundle targets and Linux runner dependencies.
